import {
  asRecord,
  readString,
  readNumber,
  readBoolean,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";

/**
 * Market data tools. All endpoints are public REST GETs against the
 * `${baseUrl}/trading/` mountpoint and require no wallet.
 *
 * Source-of-truth for endpoint shapes:
 *   - the Dexalot frontend's `src/api/index.ts` (actual production calls)
 *   - the @dexalot/dexalot-sdk types under `core/`
 *
 * NOTE: `market_get_orderbook` is intentionally deferred to a later stage
 * because Dexalot's orderbook is delivered either via WebSocket (frontend
 * pattern) or via on-chain TradePairs contract reads (SDK pattern). Neither
 * fits the pure-REST market mountpoint we're shipping in Stage 2.
 */

const PAIR_PROP = {
  type: "string" as const,
  description: 'Trading pair in "BASE/QUOTE" form, e.g. "ALOT/USDC" or "AVAX/USDC".',
};

export function registerMarketTools(): ToolSpec[] {
  return [
    {
      name: "market_get_pairs",
      module: "market",
      description:
        "List every CLOB trading pair on Dexalot with min/max trade amounts, decimals, base/quote token symbols, and current status. Use this first when an agent asks about availability of a pair or before placing orders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet("pairs", undefined, publicRateLimit("market_get_pairs", 10));
      },
    },

    {
      name: "market_get_tokens",
      module: "market",
      description:
        "List every token recognised by Dexalot's backend across all connected chains: subnet symbol, address per chain id, EVM decimals, auction state, virtual/native flags, and logos.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet("tokens", undefined, publicRateLimit("market_get_tokens", 10));
      },
    },

    {
      name: "market_get_environments",
      module: "market",
      description:
        "List every chain Dexalot is connected to in the active network (mainnet/testnet/devnet) — chain id, native asset symbol, environment kind, and Dexalot subnet linkage.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          frontend: {
            type: "boolean",
            description: "Include frontend-only environments. Default: true (matches the Dexalot app's behavior).",
          },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const frontend = readBoolean(args, "frontend") ?? true;
        return client.tradeGet(
          "environments",
          { frontend },
          publicRateLimit("market_get_environments", 5),
        );
      },
    },

    {
      name: "market_get_deployed_contracts",
      module: "market",
      description:
        "Fetch deployed contract addresses (Portfolio, TradePairs, MainnetRFQ, etc.) plus their ABIs for a specific Dexalot environment. Useful for low-level integrations or verifying which contracts the SDK will call.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          env: {
            type: "string",
            description: "Environment name (e.g. 'production-multi-avax', 'fuji-multi-avax'). Defaults to the active network's parent_env.",
          },
          contracttype: {
            type: "string",
            description: "Filter by contract type ('All' = every contract). Default: 'All'.",
          },
          returnabi: {
            type: "boolean",
            description: "Include the contract ABIs in the response. Default: true.",
          },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { client, config }) => {
        const args = asRecord(rawArgs);
        const env = readString(args, "env") ?? config.parentEnv;
        const contracttype = readString(args, "contracttype") ?? "All";
        const returnabi = readBoolean(args, "returnabi") ?? true;
        return client.tradeGet(
          "deployment/params",
          { env, contracttype, returnabi },
          publicRateLimit("market_get_deployed_contracts", 3),
        );
      },
    },

    {
      name: "market_get_app_settings",
      module: "market",
      description:
        "Fetch Dexalot's global app settings: feature flags, fee tiers, kill-switches, supported lists, and other runtime configuration the frontend reads at boot.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet("settings", undefined, publicRateLimit("market_get_app_settings", 5));
      },
    },

    {
      name: "market_get_candles",
      module: "market",
      description:
        "Fetch historical OHLCV candles for a pair over a time range. Granularity is set by (intervalnum, intervalstr): e.g. (1,'minutes'), (5,'minutes'), (1,'hours'), (4,'hours'), (1,'day'). Returns one entry per candle with open/high/low/close/volume.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          pair: PAIR_PROP,
          periodfrom: {
            type: "string",
            description: "Inclusive start of the window (ISO 8601 or 'YYYY-MM-DD').",
          },
          periodto: {
            type: "string",
            description: "Inclusive end of the window (ISO 8601 or 'YYYY-MM-DD').",
          },
          intervalnum: {
            type: "number",
            description: "Numeric interval (e.g. 1, 5, 15, 30, 1, 4).",
          },
          intervalstr: {
            type: "string",
            enum: ["minutes", "hours", "day"],
            description: "Interval unit. Pair with intervalnum to define candle granularity.",
          },
        },
        required: ["pair", "periodfrom", "periodto", "intervalnum", "intervalstr"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const params = {
          pair: requireString(args, "pair"),
          periodfrom: requireString(args, "periodfrom"),
          periodto: requireString(args, "periodto"),
          intervalnum: readNumber(args, "intervalnum")!,
          intervalstr: requireString(args, "intervalstr"),
        };
        return client.tradeGet("candlechart/params", params, publicRateLimit("market_get_candles", 5));
      },
    },

    {
      name: "market_get_oldest_candle_ts",
      module: "market",
      description:
        "Return the timestamp of the earliest available candle for a pair at a given interval. Useful for bounding historical backfills before calling market_get_candles. Interval uses WebSocket-style format: M5, M15, M30, H1, H4, D1, W1, MO1, MO3, MO6, Y1.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          pair: PAIR_PROP,
          interval: {
            type: "string",
            enum: ["M5", "M15", "M30", "H1", "H4", "D1", "W1", "MO1", "MO3", "MO6", "Y1", "YTD", "ALL"],
            description: "WebSocket-style interval: M5/M15/M30 (minutes), H1/H4 (hours), D1 (day), W1 (week), MO1/MO3/MO6 (months), Y1/YTD/ALL.",
          },
        },
        required: ["pair", "interval"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const params = {
          pair: requireString(args, "pair"),
          interval: requireString(args, "interval"),
        };
        return client.tradeGet("candle-min-ts", params, publicRateLimit("market_get_oldest_candle_ts", 5));
      },
    },

    {
      name: "market_get_blacklisted_addresses",
      module: "market",
      description:
        "Fetch the SDN/blacklist of addresses Dexalot's backend will refuse to serve. Useful for compliance and pre-flight checks before deposits or onboarding new users.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet(
          "sdnlist",
          undefined,
          publicRateLimit("market_get_blacklisted_addresses", 1),
        );
      },
    },
  ];
}
