import { DexalotClient, createConfig } from "@dexalot/dexalot-sdk";
import type { DexalotConfig as SdkConfig } from "@dexalot/dexalot-sdk";
import type { DexalotConfig } from "../config.js";
import { ChainError, ConfigError } from "../utils/errors.js";

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

  public constructor(config: DexalotConfig) {
    this.config = config;
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
    if (!this.config.privateKey) {
      // A locked encrypted_key profile surfaces its specific guidance here,
      // rather than failing every (public) command at config-load time.
      throw this.config.walletError ?? new ConfigError(
        "Operation requires a wallet, but no private key was loaded.",
        "Set DEXALOT_PRIVATE_KEY or add private_key to your ~/.dexalot/config.toml profile.",
      );
    }
  }
}
