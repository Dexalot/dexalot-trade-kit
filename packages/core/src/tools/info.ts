import { publicRateLimit, signedRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";

/**
 * Info module: announcements, volume rebate tiers, and per-account rebate
 * info. The first three tools are public REST against `/trading/`; the
 * last one is signed REST against `/trading/signed/`.
 */

export function registerInfoTools(): ToolSpec[] {
  return [
    {
      name: "info_get_high_priority_announcements",
      module: "info",
      description:
        "Fetch high-priority (level 0) Dexalot announcements: outages, freezes, urgent migrations. Returns the items shown in the prominent banner on app.dexalot.com. Always call this before trading to confirm no active incidents.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet(
          "announcement/0",
          undefined,
          publicRateLimit("info_get_high_priority_announcements", 5),
        );
      },
    },

    {
      name: "info_get_announcements",
      module: "info",
      description:
        "Fetch general Dexalot announcements (level 4): feature releases, new listings, scheduled maintenance, marketing. Less urgent than the high-priority feed.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet(
          "announcement/4",
          undefined,
          publicRateLimit("info_get_announcements", 5),
        );
      },
    },

    {
      name: "info_get_volume_rebate_tiers",
      module: "info",
      description:
        "Fetch Dexalot's volume rebate tier table: each tier's min 30-day volume threshold, maker discount, and taker discount in basis points. Use to model fee schedules and tier promotions.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.tradeGet(
          "volrebatetiers",
          undefined,
          publicRateLimit("info_get_volume_rebate_tiers", 3),
        );
      },
    },

    {
      name: "info_get_account_volume_rebate",
      module: "info",
      description:
        "Fetch the connected wallet's current volume rebate state: trailing 30d volume, current tier, effective maker/taker fees. Requires the x-signature header (wallet must be configured).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { client }) => {
        return client.signedGet(
          "tradervolrebate",
          undefined,
          signedRateLimit("info_get_account_volume_rebate", 3),
        );
      },
    },
  ];
}
