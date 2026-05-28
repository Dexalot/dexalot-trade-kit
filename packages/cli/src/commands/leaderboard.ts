import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues, transform?: (rest: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const args = transform ? transform({ ...v.rest }) : { ...v.rest };
  const result = await runner(toolName, args);
  printResult(result, { json: v.json });
}

function splitList(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}

export async function dispatchLeaderboardCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-top-traders":
    case "top-traders":              await call(runner, "leaderboard_get_top_traders", v); return true;
    case "get-table-parameters":
    case "table-params":             await call(runner, "leaderboard_get_table_parameters", v); return true;
    case "get-breakdown-parameters":
    case "breakdown-params":         await call(runner, "leaderboard_get_breakdown_parameters", v); return true;
    case "get-last-updates-timestamp":
    case "last-updated":             await call(runner, "leaderboard_get_last_updates_timestamp", v); return true;
    case "get-single-trader-info":
    case "single-trader-info":       await call(runner, "leaderboard_get_single_trader_info", v); return true;
    case "get-single-trader-breakdown":
    case "single-trader-breakdown":  await call(runner, "leaderboard_get_single_trader_breakdown", v); return true;
    case "get-trader-by-account":
    case "trader-by-account":        await call(runner, "leaderboard_get_trader_by_account", v); return true;
    case "get-trader-subnet-incentives-info":
    case "subnet-incentives-info":   await call(runner, "leaderboard_get_trader_subnet_incentives_info", v); return true;
    case "get-trader-breakdown-claim-info":
    case "breakdown-claim-info":     await call(runner, "leaderboard_get_trader_breakdown_claim_info", v); return true;
    case "get-trader-subnet-incentives-signature":
    case "subnet-incentives-signature": await call(runner, "leaderboard_get_trader_subnet_incentives_signature", v); return true;
    case "get-trader-breakdown-claim-signature":
    case "breakdown-claim-signature": await call(runner, "leaderboard_get_trader_breakdown_claim_signature", v); return true;
    case "get-apys":
    case "apys":
      await call(runner, "leaderboard_get_apys", v, (rest) => ({ ...rest, traderaddresses: splitList(rest.traderaddresses) }));
      return true;
    default:
      return false;
  }
}
