/** Default API base URL — mainnet. Network resolution picks one of {mainnet,testnet,devnet}. */
export const DEXALOT_API_BASE_URL = "https://api.dexalot.com/api";

/** Default source tag included with every order placement for attribution. */
export const DEFAULT_SOURCE_TAG = "DEXALOT_MCP";

/** Static message signed by the wallet to produce the x-signature header value. */
export const DEXALOT_SIGNATURE_MESSAGE = "dexalot";

// ---------------------------------------------------------------------------
// Network registry
// ---------------------------------------------------------------------------

export interface DexalotNetwork {
  label: string;
  apiBaseUrl: string;
  wsUrl: string;
  /**
   * SDK `parentEnv` mapping. Devnet reuses fuji code path; profile/env vars can
   * override `apiBaseUrl` and per-chain RPC to point at devnet endpoints.
   */
  parentEnv: string;
  /** User-facing web URL for the trading interface (informational). */
  webUrl: string;
}

export const DEXALOT_NETWORKS = {
  mainnet: {
    label: "Mainnet",
    apiBaseUrl: "https://api.dexalot.com/api",
    wsUrl: "wss://api.dexalot.com/api/ws",
    parentEnv: "production-multi-avax",
    webUrl: "https://app.dexalot.com",
  },
  testnet: {
    label: "Testnet (Fuji)",
    apiBaseUrl: "https://api.dexalot-test.com/api",
    wsUrl: "wss://api.dexalot-test.com/api/ws",
    parentEnv: "fuji-multi-avax",
    webUrl: "https://app.dexalot-test.com",
  },
  devnet: {
    label: "Devnet",
    apiBaseUrl: "https://api.dexalot-dev.com/api",
    wsUrl: "wss://api.dexalot-dev.com/api/ws",
    // Devnet uses its own env prefix on the backend: `dev-fuji-avax` (not
    // `fuji-multi-avax`). The SDK still treats anything with "fuji" in it as
    // testnet for URL inference, so SDK init works; the `deployment/params`
    // endpoint expects this exact env name.
    parentEnv: "dev-fuji-avax",
    webUrl: "https://app.dexalot-dev.com",
  },
} as const satisfies Record<string, DexalotNetwork>;

export type NetworkId = keyof typeof DEXALOT_NETWORKS;
export const NETWORK_IDS = Object.keys(DEXALOT_NETWORKS) as NetworkId[];

// ---------------------------------------------------------------------------
// Module registry
// ---------------------------------------------------------------------------

/** CLOB sub-modules let agents enable read-only order queries without write tools. */
export const CLOB_SUB_MODULE_IDS = [
  "clob.read",
  "clob.write",
] as const;

export type ClobSubModuleId = (typeof CLOB_SUB_MODULE_IDS)[number];

export const CLOB_DEFAULT_SUB_MODULES: ClobSubModuleId[] = ["clob.read"];

export const MODULES = [
  "market",
  ...CLOB_SUB_MODULE_IDS,
  "swap",
  "portfolio",
  "transfer",
  "analytics",
  "leaderboard",
  "vaults",
  "trader_history",
  "rewards",
  "info",
  "pnl",
] as const;

export type ModuleId = (typeof MODULES)[number];

/**
 * Default modules when --modules is not specified.
 *
 * Picks a read-only-friendly set so the server starts with no key and
 * agents have something to query immediately.
 */
export const DEFAULT_MODULES: ModuleId[] = [
  "market",
  "clob.read",
  "portfolio",
  "analytics",
];

// Aliases (resolved by parseModuleList in config.ts):
//   "all":  every module above
//   "clob": clob.read + clob.write
//   "clob.all": same as "clob"

// ---------------------------------------------------------------------------
// Module descriptions — single source of truth for CLI help and MCP descriptions
// ---------------------------------------------------------------------------

export type CliModuleKey =
  | ModuleId
  | "clob"
  | "config"
  | "setup"
  | "diagnose"
  | "upgrade";

export const MODULE_DESCRIPTIONS: Record<CliModuleKey, string> = {
  market:           "Market data (pairs, tokens, orderbook, candles, environments, deployments)",
  "clob.read":      "CLOB order queries (open orders, order detail by id/clientOrderId, order history)",
  "clob.write":     "CLOB order placement and cancellation (place, replace, cancel, batch ops) — on-chain writes",
  swap:             "RFQ swap pairs, soft/firm quotes, and on-chain swap execution",
  portfolio:        "Portfolio balances (Dexalot L1 + multi-chain), USD prices, balance proofs",
  transfer:         "Deposits, withdrawals, gas top-up/removal, portfolio-to-portfolio transfers, transfer history",
  analytics:        "Daily volumes, top tokens/pairs, stats, 24h stats, burned-ALOT data, trader APYs",
  leaderboard:      "Trader leaderboard, rewards per pair, per-trader breakdowns, claim signatures",
  vaults:           "OmniVault info, vault assets/transfers, creation config, signed vault creation",
  trader_history:   "Trader history requests (signed list + register)",
  rewards:          "Subnet incentives info, breakdown claim info/signatures, Merkl stake rewards",
  info:             "Announcements (high-priority + regular), volume rebate tiers + per-account rebate info",
  pnl:              "Profit-and-loss for a date range (signed POST)",
  clob:             "CLOB trading (alias for clob.read + clob.write)",
  config:           "Manage CLI configuration profiles (~/.dexalot/config.toml)",
  setup:            "Set up client integrations (Claude Desktop, Cursor, Windsurf, VSCode, Claude Code)",
  diagnose:         "Run network / MCP server diagnostics",
  upgrade:          "Upgrade dexalot CLI and MCP server to the latest stable version",
};
