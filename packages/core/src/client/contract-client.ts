import { DexalotClient, createConfig } from "@dexalot/dexalot-sdk";
import type { DexalotConfig as SdkConfig } from "@dexalot/dexalot-sdk";
import type { DexalotConfig } from "../config.js";
import { ChainError, ConfigError } from "../utils/errors.js";

/**
 * Dexalot contract revert codes → human-readable messages. Mirrors the
 * SDK's internal ERROR_CODES map (not exported publicly, so duplicated
 * here). Covers Portfolio, TradePairs, MainnetRFQ contracts.
 *
 * Source: dexalot-sdk-typescript/src/errors.ts
 */
const DEXALOT_REVERT_CODES: Record<string, string> = {
  // ── Portfolio ─────────────────────────────────────────────────────────
  "P-AFNE-01": "Portfolio: available funds not enough while entering order",
  "P-AFNE-02": "Portfolio: available funds not enough while attempting to transfer tokens between accounts",
  "P-AFNE-03": "Portfolio: available funds not enough during withdraw",
  "P-NETD-01": "Portfolio: not enough ERC20 token balance to deposit (source-chain wallet balance is below the deposit amount)",
  "P-WUTH-01": "Portfolio: withdraw under threshold (the LayerZero bridge fee exceeds the amount; increase the withdraw amount)",
  "P-DUTH-01": "Portfolio: deposit under threshold (the bridge fee exceeds the deposit amount; increase the deposit amount)",
  "P-BLTH-01": "Portfolio: subnet wallet balance (Gas Tank) under threshold",
  "P-BANA-01": "Portfolio: account banned",
  "P-NTDP-01": "Portfolio: deposits paused",
  "P-ETNS-01": "Portfolio: token is not supported in the subnet",
  "P-ETNS-02": "Portfolio: token is not supported in the host chain",
  "P-TNEF-01": "Portfolio: transaction amount not enough to cover fees",
  "P-DOTS-01": "Portfolio: origin and destination addresses should be different",
  "P-OOWN-01": "Portfolio: only owner can withdraw native token",
  "P-OOWN-02": "Portfolio: only owner can deposit native token",
  "P-WNFA-01": "Portfolio: withdrawNative failed",
  "P-OODT-01": "Portfolio: only owner can deposit erc20 tokens",
  "P-OOWT-01": "Portfolio: only owner can withdraw ERC20 tokens",
  "P-ZETD-01": "Portfolio: zero erc20 token quantity",
  "P-OACC-02": "Portfolio: address cannot be address(0)",
  "P-ZADDR-01": "Portfolio: token address cannot be zero address(0)",
  "P-ZADDR-02": "Portfolio: trader address cannot be zero address(0)",
  "P-NDNS-01": "Portfolio: native deposits not supported",
  "P-VLBF-01": "Portfolio: msg.value is less than the native bridge fee for deposit",
  "P-AUCT-01": "Portfolio: cannot withdraw/transfer auction token before auction is finalized",
  "P-TSDM-01": "Portfolio: token symbols do not match",
  "P-TDDM-01": "Portfolio: token decimals do not match",
  // ── RFQ backend reason codes (returned as success:false body) ──────────
  "FQ-003": "RFQ: out of quote limit for the given quantity (the maker can't fill this size)",
  "FQ-009": "RFQ: swap not allowed — wallet on temporary blacklist (retry after the cooldown reported in the error)",
  "FQ-015": "RFQ: maker is protecting against a bad orderbook state and refuses to quote (try a smaller amount or a different pair/direction)",
  // ── MainnetRFQ contract reverts ────────────────────────────────────────
  "RF-QE-01": "MainnetRFQ: quote expired due to manual override",
  "RF-QE-02": "MainnetRFQ: quote expired (block timestamp past quote expiry)",
  "RF-IN-01": "MainnetRFQ: invalid nonce",
  "RF-IN-02": "MainnetRFQ: invalid nonce on cross-chain destination",
  "RF-IMS-01": "MainnetRFQ: invalid msg.sender (taker address mismatch)",
  "RF-IS-01": "MainnetRFQ: invalid order signature",
  "RF-IMV-01": "MainnetRFQ: invalid msg.value (for native-asset takers, transaction value must equal takerAmount — SDK does not set this for native swaps)",
  "RF-TF-01": "MainnetRFQ: transfer failed (maker side)",
  "RF-TF-02": "MainnetRFQ: transfer failed (taker side)",
  "RF-STTA-01": "MainnetRFQ: slippage tolerance too aggressive",
  "RF-INVT-01": "MainnetRFQ: target chain does not have enough inventory",
  "RF-DTNF-01": "MainnetRFQ: destination token not found",
  // ── TradePairs ─────────────────────────────────────────────────────────
  "T-LTMT-01": "TradePairs: trade amount is less than minTradeAmount for the trade pair",
  "T-MTMT-01": "TradePairs: trade amount is more than maxTradeAmount for the trade pair",
  "T-LTPA-01": "TradePairs: trade amount is less than minPostAmount (cannot be posted in the orderbook)",
  "T-OOCC-01": "TradePairs: only owner of the order can cancel",
  "T-PPAU-01": "TradePairs: pair paused",
  "T-PPAU-02": "TradePairs: cancelOrder pair paused",
  "T-AOPA-01": "TradePairs: addOrder paused",
  "T-IVOT-01": "TradePairs: invalid order type",
  "T-LONR-01": "TradePairs: Limit order type cannot be removed",
  "T-FOKF-01": "TradePairs: FOK order can't be fully filled. Tx reverted",
  "T-POOA-01": "Portfolio: Only PO (PostOnly) orders allowed for this pair",
};

function parseRevertReason(errorMsg: unknown): string {
  const errorStr = String(errorMsg);
  for (const [code, description] of Object.entries(DEXALOT_REVERT_CODES)) {
    if (errorStr.includes(code)) {
      return `${code}: ${description}`;
    }
  }
  return errorStr;
}

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
    const decoded = parseRevertReason(raw);
    // Only attach the raw error as a separate field when decoding actually
    // matched a known revert code, so tests / agents can see both.
    throw new ChainError(decoded, { endpoint });
  }

  /**
   * Assert a wallet is configured. Most on-chain ops require it. Throws
   * ConfigError with actionable guidance otherwise.
   */
  public requireWallet(): void {
    if (!this.config.privateKey) {
      throw new ConfigError(
        "Operation requires a wallet, but no private key was loaded.",
        "Set DEXALOT_PRIVATE_KEY or add private_key to your ~/.dexalot/config.toml profile.",
      );
    }
  }
}
