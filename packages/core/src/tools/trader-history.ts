import {
  asRecord,
  requireString,
} from "./helpers.js";
import { signedRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";

/**
 * Trader history requests: the connected wallet can request periodic
 * exports of its trading history. Two endpoints: list previously requested
 * exports + register a new request for a date range.
 */
export function registerTraderHistoryTools(): ToolSpec[] {
  return [
    {
      name: "trader_history_get",
      module: "trader_history",
      description:
        "List trader-history export requests previously submitted by the connected wallet. Returns request id, period, status, and download links (when ready).",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet("trader-history-requests", undefined, signedRateLimit("trader_history_get", 3)),
    },

    {
      name: "trader_history_register",
      module: "trader_history",
      description:
        "Register a new trader-history export request for a date range. Dexalot's backend processes asynchronously; poll trader_history_get for completion. periodfrom / periodto accept ISO 8601 or YYYY-MM-DD.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          periodfrom: { type: "string", description: "Start of the window." },
          periodto: { type: "string", description: "End of the window." },
        },
        required: ["periodfrom", "periodto"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        return client.signedGet(
          "register-trader-history-requests",
          {
            periodFrom: requireString(args, "periodfrom"),
            periodTo: requireString(args, "periodto"),
          },
          signedRateLimit("trader_history_register", 1),
        );
      },
    },
  ];
}
