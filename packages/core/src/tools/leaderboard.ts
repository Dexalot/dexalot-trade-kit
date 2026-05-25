import {
  asRecord,
  readString,
  requireString,
} from "./helpers.js";
import { publicRateLimit, signedRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";

/**
 * Leaderboard module: trader rewards rankings, per-trader rewards info,
 * and the claim-signature flow. Routes:
 *
 *   - Public lookups (top-traders, table-parameters, breakdowns)
 *       → TRADE_API GET (no auth)
 *   - Connected-wallet lookups (trader-by-account, subnet incentives)
 *       → SIGNED_API GET (requires x-signature)
 */

const PAIR_PROP = {
  type: "string" as const,
  description: 'Trading pair (e.g. "ALOT/USDC").',
};

const TOKEN_PROP = {
  type: "string" as const,
  description: "Reward token symbol.",
};

const DATEPERIOD_PROP = {
  type: "string" as const,
  description: "Period label (week, month, all, … — see Dexalot reward schedule).",
};

const TRADER_ADDR_PROP = {
  type: "string" as const,
  description: "Trader EVM address (0x-prefixed, case-insensitive).",
};

export function registerLeaderboardTools(): ToolSpec[] {
  return [
    {
      name: "leaderboard_get_top_traders",
      module: "leaderboard",
      description:
        "Top traders for a given pair + token + dateperiod (e.g. weekly USDC rewards on ALOT/USDC). Returns a ranked array with each trader's reward amount and rank.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { token: TOKEN_PROP, pair: PAIR_PROP, dateperiod: DATEPERIOD_PROP },
        required: ["token", "pair", "dateperiod"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        return client.tradeGet(
          "toptraderrewards/params",
          {
            token: requireString(args, "token"),
            pair: requireString(args, "pair"),
            dateperiod: requireString(args, "dateperiod"),
          },
          publicRateLimit("leaderboard_get_top_traders", 5),
        );
      },
    },

    {
      name: "leaderboard_get_table_parameters",
      module: "leaderboard",
      description:
        "Available pair / dateperiod combinations for the rewards leaderboard. Returns the dropdowns the Dexalot app populates at boot.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.tradeGet("getrewardpairsdates", undefined, publicRateLimit("leaderboard_get_table_parameters", 3)),
    },

    {
      name: "leaderboard_get_breakdown_parameters",
      module: "leaderboard",
      description:
        "Available date ranges for per-trader reward breakdowns. Use to populate filters before calling get_single_trader_breakdown.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.tradeGet("getrewarddates", undefined, publicRateLimit("leaderboard_get_breakdown_parameters", 3)),
    },

    {
      name: "leaderboard_get_last_updates_timestamp",
      module: "leaderboard",
      description: "Timestamp of the last leaderboard recompute on the backend. Useful for staleness banners.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.tradeGet("getrewardlastupdated", undefined, publicRateLimit("leaderboard_get_last_updates_timestamp", 3)),
    },

    {
      name: "leaderboard_get_single_trader_info",
      module: "leaderboard",
      description:
        "Reward info for a single trader for a token + dateperiod combination. Public — no auth required; pass any traderaddress to look it up.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { traderaddress: TRADER_ADDR_PROP, token: TOKEN_PROP, dateperiod: DATEPERIOD_PROP },
        required: ["traderaddress", "token", "dateperiod"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        return client.tradeGet(
          "traderreward/params",
          {
            traderaddress: requireString(args, "traderaddress").toLowerCase(),
            token: requireString(args, "token"),
            dateperiod: requireString(args, "dateperiod"),
          },
          publicRateLimit("leaderboard_get_single_trader_info", 5),
        );
      },
    },

    {
      name: "leaderboard_get_single_trader_breakdown",
      module: "leaderboard",
      description:
        "Per-pair breakdown of one trader's rewards for a token + dateperiod. Shows which pairs the trader earned on. Public.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { traderaddress: TRADER_ADDR_PROP, token: TOKEN_PROP, dateperiod: DATEPERIOD_PROP },
        required: ["traderaddress", "token", "dateperiod"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        return client.tradeGet(
          "traderrewardbreakdown/params",
          {
            traderaddress: requireString(args, "traderaddress").toLowerCase(),
            token: requireString(args, "token"),
            dateperiod: requireString(args, "dateperiod"),
          },
          publicRateLimit("leaderboard_get_single_trader_breakdown", 5),
        );
      },
    },

    {
      name: "leaderboard_get_trader_by_account",
      module: "leaderboard",
      description:
        "Connected-wallet variant of single_trader_info: hits the signed endpoint and returns the active wallet's reward info. Differs from the public variant by trusting the x-signature header.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { traderaddress: TRADER_ADDR_PROP, token: TOKEN_PROP, pair: PAIR_PROP, dateperiod: DATEPERIOD_PROP },
        required: ["traderaddress", "token", "pair", "dateperiod"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        return client.signedGet(
          "traderreward",
          {
            traderaddress: requireString(args, "traderaddress").toLowerCase(),
            token: requireString(args, "token"),
            pair: requireString(args, "pair"),
            dateperiod: requireString(args, "dateperiod"),
          },
          signedRateLimit("leaderboard_get_trader_by_account", 3),
        );
      },
    },

    {
      name: "leaderboard_get_trader_subnet_incentives_info",
      module: "leaderboard",
      description:
        "Subnet incentives (type=1) reward info for the connected wallet: how much has been earned in the current epoch and how much is claimable.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet(
          "reward/earned",
          { type: 1 },
          signedRateLimit("leaderboard_get_trader_subnet_incentives_info", 3),
        ),
    },

    {
      name: "leaderboard_get_trader_breakdown_claim_info",
      module: "leaderboard",
      description:
        "Detailed per-period breakdown reward info for the connected wallet (no type filter). Used by the claim wizard to show pending vs claimed amounts.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet("reward/earned", undefined, signedRateLimit("leaderboard_get_trader_breakdown_claim_info", 3)),
    },

    {
      name: "leaderboard_get_trader_subnet_incentives_signature",
      module: "leaderboard",
      description:
        "Backend signature authorizing a subnet-incentives claim for the connected wallet. Pass the returned signature to the on-chain claim contract.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet(
          "reward/signature",
          { type: 1 },
          signedRateLimit("leaderboard_get_trader_subnet_incentives_signature", 2),
        ),
    },

    {
      name: "leaderboard_get_trader_breakdown_claim_signature",
      module: "leaderboard",
      description:
        "Backend signature authorizing a per-pair breakdown claim. Optionally supports OAuth-style code/redirect_uri params for explicit-claim flows.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Optional OAuth code from the claim flow." },
          redirect_uri: { type: "string", description: "Optional OAuth redirect URI." },
          claimedInTerms: {
            type: "boolean",
            description: "If true, suppress params (claim previously acknowledged).",
          },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const claimedInTerms = args.claimedInTerms === true;
        const params: Record<string, string> = {};
        if (!claimedInTerms) {
          const code = readString(args, "code");
          const redirect_uri = readString(args, "redirect_uri");
          if (code) params.code = code;
          if (redirect_uri) params.redirect_uri = redirect_uri;
        }
        return client.signedGet(
          "reward/signature",
          Object.keys(params).length > 0 ? params : undefined,
          signedRateLimit("leaderboard_get_trader_breakdown_claim_signature", 2),
        );
      },
    },

    {
      name: "leaderboard_get_apys",
      module: "leaderboard",
      description:
        "Per-trader APY (annualized return) over a dateperiod. POST endpoint — accepts a list of trader addresses. Mirrors analytics_get_apys but registered under leaderboard for the trader-comparison agent workflow.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          traderaddresses: {
            type: "array",
            items: { type: "string" },
            description: "Trader addresses (case-insensitive).",
          },
          dateperiod: DATEPERIOD_PROP,
        },
        required: ["traderaddresses", "dateperiod"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const traders = Array.isArray(args.traderaddresses) ? args.traderaddresses.map(String) : [];
        if (traders.length === 0) {
          throw new Error("traderaddresses must be a non-empty array.");
        }
        return client.tradePost(
          "apys",
          { traderaddresses: traders },
          publicRateLimit("leaderboard_get_apys", 3),
          { dateperiod: requireString(args, "dateperiod") },
        );
      },
    },
  ];
}
