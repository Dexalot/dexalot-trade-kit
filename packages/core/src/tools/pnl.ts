import {
  asRecord,
  requireString,
} from "./helpers.js";
import { signedRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";

/**
 * PnL module: a single signed POST endpoint that returns realized + unrealized
 * profit-and-loss for the connected wallet over a date range.
 */
export function registerPnlTools(): ToolSpec[] {
  return [
    {
      name: "pnl_get",
      module: "pnl",
      description:
        "Profit-and-loss for the connected wallet over a date range. Returns realized + unrealized PnL broken down by token. POST signed REST.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Start of the window (ISO 8601 or YYYY-MM-DD)." },
          dateTo: { type: "string", description: "End of the window." },
        },
        required: ["dateFrom", "dateTo"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        return client.signedPost(
          "pnl",
          {
            dateFrom: requireString(args, "dateFrom"),
            dateTo: requireString(args, "dateTo"),
          },
          signedRateLimit("pnl_get", 2),
        );
      },
    },
  ];
}
