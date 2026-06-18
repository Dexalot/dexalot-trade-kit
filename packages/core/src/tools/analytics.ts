import {
  asRecord,
  readNumber,
  readString,
  readStringArray,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";
import { ValidationError } from "../utils/errors.js";
import type { ToolSpec } from "./types.js";

/**
 * Analytics module: aggregate stats and rankings published by Dexalot's
 * `${baseUrl}/stats/` mountpoint. All endpoints are public REST GETs except
 * `get_apys` which is a POST against /trading/apys.
 */

/** Sentinel "from"-date used by Dexalot's 24h-stats endpoint to mean "rolling 24h window". */
const STATS_24H_PARAM = "9999-12-31";

export function registerAnalyticsTools(): ToolSpec[] {
  return [
    {
      name: "analytics_get_daily_volumes",
      module: "analytics",
      description:
        "Daily trading volume across the Dexalot L1. Returns one record per day with total volume, base-asset volume, USD-denominated volume, and trade count. Useful for monitoring activity trends.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.analyticsGet(
          "dailyvolumes",
          undefined,
          publicRateLimit("analytics_get_daily_volumes", 5),
        );
      },
    },

    {
      name: "analytics_get_top_tokens",
      module: "analytics",
      description:
        "Rank Dexalot L1 tokens by recent volume / market cap. Returns the top traded tokens with USD volume, price changes, and trade counts. Use to discover what's active without scanning every pair.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.analyticsGet(
          "toptokens",
          undefined,
          publicRateLimit("analytics_get_top_tokens", 5),
        );
      },
    },

    {
      name: "analytics_get_top_pairs",
      module: "analytics",
      description:
        "Rank Dexalot CLOB pairs by recent volume. Returns top pairs with volume, last price, 24h change, and trade counts. Combine with market_get_pairs for full per-pair metadata.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.analyticsGet(
          "toppairs",
          undefined,
          publicRateLimit("analytics_get_top_pairs", 5),
        );
      },
    },

    {
      name: "analytics_get_stats",
      module: "analytics",
      description:
        "Aggregate exchange stats since the inception of Dexalot (or a date range). Returns total volume, total fees, total trades, unique traders. Without a date range it returns the cumulative 'all time' totals.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          periodfrom: {
            type: "string",
            description: "Optional start date for the window (ISO 8601 or YYYY-MM-DD). Omit for inception-to-date.",
          },
          periodto: {
            type: "string",
            description: "Optional end date for the window. Omit to use 'now'.",
          },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const params: Record<string, string> = {};
        const from = readString(args, "periodfrom");
        const to = readString(args, "periodto");
        if (from) params.periodfrom = from;
        if (to) params.periodto = to;
        return client.analyticsGet(
          "totals/params",
          Object.keys(params).length > 0 ? params : undefined,
          publicRateLimit("analytics_get_stats", 5),
        );
      },
    },

    {
      name: "analytics_get_24h_stats",
      module: "analytics",
      description:
        "Rolling 24-hour exchange stats. Convenience wrapper around analytics_get_stats with the sentinel periodfrom that signals 'last 24h'. Returns the same shape as get_stats but bounded to the last day of activity.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.analyticsGet(
          "totals/params",
          { periodfrom: STATS_24H_PARAM },
          publicRateLimit("analytics_get_24h_stats", 5),
        );
      },
    },

    {
      name: "analytics_get_burned_fee_data",
      module: "analytics",
      description:
        "ALOT burned-fee history. Dexalot routes a portion of taker fees to a burn address; this endpoint returns burn amounts bucketed by `interval` minutes between `from` and `to` (date or ISO 8601). Useful for ALOT tokenomics dashboards.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Start of the window (ISO 8601 or YYYY-MM-DD). Alias: periodfrom.",
          },
          to: {
            type: "string",
            description: "End of the window (ISO 8601 or YYYY-MM-DD). Alias: periodto.",
          },
          interval: {
            type: "number",
            description: "Bucket interval in minutes (e.g. 1440 for daily). Default: 1440.",
          },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        // Accept both `from`/`to` (canonical, matches backend) and
        // `periodfrom`/`periodto` (the convention everywhere else in this kit).
        const from = readString(args, "from") ?? readString(args, "periodfrom");
        const to = readString(args, "to") ?? readString(args, "periodto");
        if (!from || !to) {
          throw new ValidationError("analytics_get_burned_fee_data requires `from` and `to` (or aliases periodfrom/periodto).");
        }
        const interval = readNumber(args, "interval") ?? 1440;
        return client.analyticsGet(
          "alotburned",
          { from, to, interval },
          publicRateLimit("analytics_get_burned_fee_data", 3),
        );
      },
    },

    {
      name: "analytics_get_apys",
      module: "analytics",
      description:
        "Trader APY (annualized return) for a list of trader addresses anchored to a specific date period. `dateperiod` is a calendar date in YYYY-MM-DD form (e.g. 2026-04-01); the backend computes APY through that period. POST endpoint, up to ~200 addresses per call.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          traderaddresses: {
            type: "array",
            items: { type: "string" },
            description: "Array of 0x-prefixed EVM addresses (case-insensitive).",
          },
          dateperiod: {
            type: "string",
            description: "Calendar date in YYYY-MM-DD form anchoring the APY window (e.g. 2026-04-01).",
          },
        },
        required: ["traderaddresses", "dateperiod"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const traders = readStringArray(args, "traderaddresses");
        if (!traders || traders.length === 0) {
          throw new ValidationError("analytics_get_apys requires at least one traderaddresses entry.");
        }
        const dateperiod = requireString(args, "dateperiod");
        return client.tradePost(
          "apys",
          { traderaddresses: traders },
          publicRateLimit("analytics_get_apys", 3),
          { dateperiod },
        );
      },
    },
  ];
}
