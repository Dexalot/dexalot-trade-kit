import {
  asRecord,
  readString,
  readNumber,
  readBoolean,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";
import { ValidationError } from "../utils/errors.js";

/**
 * Market data tools.
 *
 * Routing (SDK-first per project policy — use the SDK wherever it has a
 * method, fall back to REST only for endpoints the SDK doesn't expose):
 *
 *   SDK:  get_pairs (getClobPairs), get_tokens (getTokens),
 *         get_environments (getEnvironments), get_orderbook (getOrderBook),
 *         get_candles (getCandles), get_deployed_contracts (getDeployment)
 *   REST: get_oldest_candle_ts, get_app_settings,
 *         get_blacklisted_addresses  — no SDK method exists
 *
 * Source-of-truth for REST endpoint shapes: the Dexalot frontend's
 * `src/api/index.ts`.
 */

/**
 * Map a (intervalnum, intervalstr) tuple — the trade-kit's public input shape
 * (mirrors the legacy REST /candlechart/params signature) — onto the SDK's
 * compact interval string. The SDK accepts exactly these seven values; any
 * other combination is rejected here with a clear ValidationError instead of
 * being silently forwarded.
 */
const CANDLE_INTERVAL_MAP: Record<string, { sdk: string; seconds: number }> = {
  "1:minutes": { sdk: "1m", seconds: 60 },
  "5:minutes": { sdk: "5m", seconds: 5 * 60 },
  "15:minutes": { sdk: "15m", seconds: 15 * 60 },
  "30:minutes": { sdk: "30m", seconds: 30 * 60 },
  "1:hours": { sdk: "1h", seconds: 60 * 60 },
  "4:hours": { sdk: "4h", seconds: 4 * 60 * 60 },
  "1:day": { sdk: "1d", seconds: 24 * 60 * 60 },
};

/** SDK's hard ceiling on the `limit` argument to getCandles (see clob.ts). */
const SDK_CANDLE_LIMIT_MAX = 500;

function resolveCandleInterval(intervalnum: number, intervalstr: string): { sdk: string; seconds: number } {
  const key = `${intervalnum}:${intervalstr}`;
  const spec = CANDLE_INTERVAL_MAP[key];
  if (!spec) {
    const allowed = Object.keys(CANDLE_INTERVAL_MAP).join(", ");
    throw new ValidationError(
      `Unsupported candle interval (${intervalnum}, "${intervalstr}"). Allowed (intervalnum:intervalstr): ${allowed}.`,
    );
  }
  return spec;
}

function computeCandleLimit(periodfrom: string, periodto: string, intervalSeconds: number): number {
  const fromMs = Date.parse(periodfrom);
  const toMs = Date.parse(periodto);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new ValidationError(
      "Could not parse periodfrom/periodto as dates. Use ISO 8601 ('YYYY-MM-DDTHH:MM:SSZ') or 'YYYY-MM-DD'.",
    );
  }
  const rangeSec = Math.max(0, (toMs - fromMs) / 1000);
  const raw = Math.ceil(rangeSec / intervalSeconds);
  // Clamp to [1, SDK_CANDLE_LIMIT_MAX]. The SDK rejects 0 or values > 500.
  return Math.min(SDK_CANDLE_LIMIT_MAX, Math.max(1, raw));
}

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
      handler: async (_args, { contract }) => {
        const sdk = await contract.get();
        const data = contract.unwrap(await sdk.getClobPairs(), "market.getClobPairs");
        return { endpoint: "SDK getClobPairs", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "market_get_tokens",
      module: "market",
      description:
        "List every token recognised by Dexalot's backend across all connected chains: Dexalot L1 symbol, address per chain id, EVM decimals, auction state, virtual/native flags, and logos.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { contract }) => {
        const sdk = await contract.get();
        const data = contract.unwrap(await sdk.getTokens(), "market.getTokens");
        return { endpoint: "SDK getTokens", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "market_get_environments",
      module: "market",
      description:
        "List every chain Dexalot is connected to in the active network (mainnet/testnet/devnet) — chain id, native asset symbol, environment kind, and Dexalot L1 linkage.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { contract }) => {
        const sdk = await contract.get();
        const data = contract.unwrap(await sdk.getEnvironments(), "market.getEnvironments");
        return { endpoint: "SDK getEnvironments", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "market_get_orderbook",
      module: "market",
      description:
        "Fetch the current order book (bids + asks with price/quantity levels) for a pair. Routes through the SDK's on-chain TradePairs read. Use before placing limit orders to gauge depth and the current spread.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          pair: PAIR_PROP,
        },
        required: ["pair"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        const pair = requireString(args, "pair");
        const sdk = await contract.get();
        const data = contract.unwrap(await sdk.getOrderBook(pair), "market.getOrderBook");
        return { endpoint: "SDK getOrderBook", requestTime: new Date().toISOString(), data };
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
      handler: async (rawArgs, { contract, config }) => {
        const args = asRecord(rawArgs);
        // Trade-kit schema uses lowercase `contracttype`/`returnabi` for
        // backward compat with the legacy REST query-param shape; the SDK
        // wraps the same backend with camelCase opts (`contractType`,
        // `returnAbi`). Translate here so existing consumers keep working.
        const env = readString(args, "env") ?? config.parentEnv;
        const contractType = readString(args, "contracttype") ?? "All";
        const returnAbi = readBoolean(args, "returnabi") ?? true;
        const sdk = await contract.get();
        const data = contract.unwrap(
          await sdk.getDeployment({ env, contractType, returnAbi }),
          "market.getDeployment",
        );
        return { endpoint: "SDK getDeployment", requestTime: new Date().toISOString(), data };
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
        "Fetch historical OHLCV candles for a pair over a time range. Granularity is set by (intervalnum, intervalstr): one of (1,'minutes'), (5,'minutes'), (15,'minutes'), (30,'minutes'), (1,'hours'), (4,'hours'), (1,'day'). Routes through the SDK's getCandles (count-back endpoint, cap 500 candles). Returns one entry per candle with open/high/low/close/volume.",
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
            description: "Numeric interval (1, 5, 15, 30 with 'minutes'; 1, 4 with 'hours'; 1 with 'day').",
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
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        const pair = requireString(args, "pair");
        const periodfrom = requireString(args, "periodfrom");
        const periodto = requireString(args, "periodto");
        const intervalnum = readNumber(args, "intervalnum")!;
        const intervalstr = requireString(args, "intervalstr");
        const intervalSpec = resolveCandleInterval(intervalnum, intervalstr);
        const limit = computeCandleLimit(periodfrom, periodto, intervalSpec.seconds);
        const sdk = await contract.get();
        const data = contract.unwrap(
          await sdk.getCandles(pair, intervalSpec.sdk, limit),
          "market.getCandles",
        );
        return { endpoint: "SDK getCandles", requestTime: new Date().toISOString(), data };
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
