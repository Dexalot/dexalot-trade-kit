import { DexalotClient, createConfig } from "@dexalot/dexalot-sdk";
import type { DexalotConfig as SdkConfig } from "@dexalot/dexalot-sdk";
import type { Signer, Provider } from "ethers";
import type { DexalotConfig } from "../config.js";
import { ChainError, ConfigError, ValidationError } from "../utils/errors.js";

/**
 * The exact Signer type the SDK's setSigner expects. The SDK is CommonJS and
 * pulls ethers' CJS build; our `import type { Signer } from "ethers"` resolves
 * to the ESM build. They're the same class at runtime but TS sees two nominal
 * types, so we cast at the boundary.
 */
type SdkSigner = Parameters<DexalotClient["setSigner"]>[0];

/**
 * Lazy wrapper around @dexalot/dexalot-sdk's DexalotClient. Holds a single
 * SDK instance per process; constructs it on first use so REST-only tools
 * (market, analytics, info, signed reads) never pay the cost of fetching
 * environments / tokens / pairs / deployments.
 *
 * Used for on-chain operations and contract reads:
 *   - clob.write — place/cancel/replace orders, batch ops
 *   - clob_get_order_by_client_id (contract read)
 *   - swap.execute_swap — RFQ settlement
 *   - transfer.deposit/withdraw/add_gas/remove_gas/transfer_portfolio
 *   - portfolio.get_balance/get_all_balances/get_chain_balance(s)/get_all_chain_balances
 *   - market.get_orderbook (deferred to Stage 4)
 *
 * The SDK returns Result<T> everywhere; this wrapper unwraps to T and throws
 * ChainError on failure, so tool handlers can use plain await semantics.
 */
export class DexalotContractClient {
  private readonly config: DexalotConfig;
  private sdk?: DexalotClient;
  private initPromise?: Promise<void>;
  /** External signer (WalletConnect) — applied via sdk.setSigner once initialized. */
  private externalSigner?: Signer;

  public constructor(config: DexalotConfig) {
    this.config = config;
  }

  /**
   * Inject an external signer (WalletConnect) whose key lives in the user's
   * wallet app. Applied immediately if the SDK is already up, otherwise during
   * the next initialize. WC mode builds the SDK with no `privateKey`, so this is
   * how the SDK learns the signer for contract reads + signed REST calls.
   */
  public async setExternalSigner(signer: Signer): Promise<void> {
    this.externalSigner = signer;
    if (this.sdk) {
      await this.attachExternalSigner(this.sdk, signer);
    }
  }

  /**
   * Hand the external signer to the SDK, first connecting it to the SDK's own
   * chain (Dexalot L1) provider when it has none. ethers needs a provider on the
   * signer to populate a write (chainId/nonce/gas) and to back `.wait()`; the
   * SDK doesn't wire that for an externally-set signer, so we do it here.
   */
  private async attachExternalSigner(sdk: DexalotClient, signer: Signer): Promise<void> {
    let toAttach = signer;
    if (!signer.provider) {
      const sdkProvider = (sdk as unknown as { provider?: Provider }).provider;
      if (sdkProvider) toAttach = signer.connect(sdkProvider);
    }
    const r = await sdk.setSigner(toAttach as unknown as SdkSigner);
    if (!r.success) {
      throw new ChainError(`Failed to attach WalletConnect signer to the SDK: ${r.error ?? "unknown error"}`);
    }
  }

  /**
   * Drop the external (WalletConnect) signer — used on disconnect so
   * `requireWallet()` no longer reports a wallet once the session is gone. The
   * SDK keeps its now-defunct signer reference, but `requireWallet()` (gated on
   * this field) throws first, so no contract op reaches it.
   */
  public clearExternalSigner(): void {
    this.externalSigner = undefined;
  }

  /**
   * Construct + initialize the SDK on first call. Idempotent.
   * Initialization triggers a fan-out of REST/contract reads (environments,
   * tokens, pairs, deployments) and can take a few hundred ms cold.
   */
  public async ensureInitialized(): Promise<DexalotClient> {
    if (this.sdk) return this.sdk;
    if (this.initPromise) {
      await this.initPromise;
      return this.sdk!;
    }
    this.initPromise = this.initSdk();
    await this.initPromise;
    return this.sdk!;
  }

  private async initSdk(): Promise<void> {
    // The SDK prepends its own path prefixes (/privapi/..., /api/...) to the
    // base URL, so strip our trailing `/api` segment first. Our REST client
    // keeps the suffix because its mountpoints (trading/, signed/, …) sit
    // under /api on the backend.
    const sdkApiBaseUrl = this.config.baseUrl.replace(/\/api\/?$/, "");

    const sdkConfig: SdkConfig = createConfig({
      parentEnv: this.config.parentEnv,
      apiBaseUrl: sdkApiBaseUrl,
      privateKey: this.config.privateKey,
      // SDK init fans out parallel RFQ-pair fetches per connected chain; the
      // backend rate-limits the burst and the SDK logs WARN on each transient
      // 500. None of that affects the data we consume (empty arrays for
      // chains without pairs). Default to "error" to suppress the noise;
      // --verbose lifts it back to debug.
      logLevel: this.config.verbose ? "debug" : "error",
      logFormat: "console",
    });

    const sdk = new DexalotClient(sdkConfig);
    const init = await sdk.initializeClient();
    if (!init.success) {
      throw new ChainError(
        `Failed to initialize Dexalot SDK: ${init.error ?? "unknown error"}`,
        {
          suggestion:
            "Check network connectivity, RPC endpoints, and that the chosen --network (mainnet/testnet/devnet) is reachable.",
        },
      );
    }
    // WalletConnect mode: no privateKey was given, so attach the wallet-held
    // signer now that the SDK is up (and connected to its chain provider).
    if (this.externalSigner) {
      await this.attachExternalSigner(sdk, this.externalSigner);
    }
    this.sdk = sdk;
  }

  /**
   * Get the SDK instance, initializing if needed. Most callers should use
   * this rather than `ensureInitialized` + `instance` pair.
   */
  public async get(): Promise<DexalotClient> {
    return this.ensureInitialized();
  }

  /**
   * Every CAIP-2 chain the SDK knows for the ACTIVE network — the Dexalot L1
   * plus each connected chain (PortfolioMain / RFQ deposit-source chains) plus
   * Ethereum (universal). Used to request a complete chain set when pairing a
   * WalletConnect session, so it's accurate per environment (devnet/testnet/
   * mainnet) instead of a hardcoded guess. Best-effort; returns [] on failure.
   */
  public async getKnownCaipChains(): Promise<string[]> {
    try {
      const sdk = (await this.ensureInitialized()) as unknown as {
        subnetChainId?: number;
        chainConfig?: Record<string, { chain_id?: number } | undefined>;
      };
      const ids = new Set<number>([1]); // Ethereum — universal, always offer it
      if (typeof sdk.subnetChainId === "number") ids.add(sdk.subnetChainId);
      for (const entry of Object.values(sdk.chainConfig ?? {})) {
        if (entry && typeof entry.chain_id === "number") ids.add(entry.chain_id);
      }
      return [...ids].map((id) => `eip155:${id}`);
    } catch {
      return [];
    }
  }

  /**
   * Resolve a user/agent-supplied chain reference — exact name ("Arbitrum
   * Sepolia"), alias ("arbitrum"), or numeric EVM chain id ("421614") — to the
   * SDK's canonical chain name, so callers don't have to know the exact string.
   * Throws a ValidationError whose message lists the valid chains when the input
   * doesn't match anything in the active environment.
   */
  public async resolveChainName(input: string): Promise<string> {
    const sdk = await this.ensureInitialized();
    const result = sdk.resolveChainReference(input, false) as {
      success: boolean;
      data?: { canonicalName?: string };
      error?: string | null;
    };
    const canonical = result.success ? result.data?.canonicalName : undefined;
    if (!canonical) {
      throw new ValidationError(
        result.error ?? `Unrecognized chain "${input}".`,
        "Pass the chain's exact name, an alias, or its numeric chain id; market_get_environments lists them.",
      );
    }
    return canonical;
  }

  /**
   * Synchronous access — throws if not initialized. Useful inside tight
   * loops where the caller knows ensureInitialized() already ran.
   */
  public get instance(): DexalotClient {
    if (!this.sdk) {
      throw new ChainError(
        "Contract client used before initialization.",
        { suggestion: "Call ensureInitialized() or get() before instance." },
      );
    }
    return this.sdk;
  }

  /**
   * Unwrap an SDK Result<T> into T or throw ChainError. Helper for tool
   * handlers to keep their code free of `if (!r.success) throw …` boilerplate.
   */
  public unwrap<T>(result: { success: boolean; data?: T; error?: string | null }, endpoint?: string): T {
    if (result.success) return result.data as T;
    const raw = result.error ?? "Dexalot SDK call failed";
    // Decode Dexalot contract revert codes (P-/T-/RF-) via the SDK's own
    // getRevertReason — single source of truth, no duplicated code map.
    let decoded = raw;
    try {
      if (this.sdk) decoded = this.sdk.getRevertReason(raw) || raw;
    } catch {
      // getRevertReason should never throw, but never let decoding mask the error.
    }
    throw new ChainError(decoded, { endpoint });
  }

  /**
   * Assert a wallet is configured. Most on-chain ops require it. Throws
   * ConfigError with actionable guidance otherwise.
   */
  public requireWallet(): void {
    if (!this.config.privateKey && !this.externalSigner) {
      // A locked encrypted_key profile surfaces its specific guidance here,
      // rather than failing every (public) command at config-load time.
      throw this.config.walletError ?? new ConfigError(
        "Operation requires a wallet, but no private key was loaded.",
        "Set DEXALOT_PRIVATE_KEY or add private_key to your ~/.dexalot/config.toml profile. " +
        "For a WalletConnect profile, run `dexalot wallet connect` (or the wallet_connect tool) first.",
      );
    }
  }
}
