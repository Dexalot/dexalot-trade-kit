import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(
  runner: ToolRunner,
  toolName: string,
  v: CliValues,
  transform?: (rest: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const args = transform ? transform({ ...v.rest }) : { ...v.rest };
  const result = await runner(toolName, args);
  printResult(result, { json: v.json });
}

function splitList(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}

export async function dispatchAnalyticsCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-daily-volumes":
    case "daily-volumes":   await call(runner, "analytics_get_daily_volumes", v); return true;
    case "get-top-tokens":
    case "top-tokens":      await call(runner, "analytics_get_top_tokens", v); return true;
    case "get-top-pairs":
    case "top-pairs":       await call(runner, "analytics_get_top_pairs", v); return true;
    case "get-stats":
    case "stats":           await call(runner, "analytics_get_stats", v); return true;
    case "get-24h-stats":
    case "24h":             await call(runner, "analytics_get_24h_stats", v); return true;
    case "get-burned-fee-data":
    case "burned":
    case "alot-burned":     await call(runner, "analytics_get_burned_fee_data", v); return true;
    case "get-apys":
    case "apys":
      await call(runner, "analytics_get_apys", v, (rest) => ({
        ...rest,
        traderaddresses: splitList(rest.traderaddresses),
      }));
      return true;
    default:
      return false;
  }
}
