import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues): Promise<void> {
  const result = await runner(toolName, { ...v.rest });
  printResult(result, { json: v.json });
}

export async function dispatchInfoCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-high-priority-announcements":
    case "high-priority":
    case "urgent":            await call(runner, "info_get_high_priority_announcements", v); return true;
    case "get-announcements":
    case "announcements":     await call(runner, "info_get_announcements", v); return true;
    case "get-volume-rebate-tiers":
    case "volume-rebate-tiers":
    case "rebate-tiers":      await call(runner, "info_get_volume_rebate_tiers", v); return true;
    case "get-account-volume-rebate":
    case "account-rebate":    await call(runner, "info_get_account_volume_rebate", v); return true;
    default:
      return false;
  }
}
