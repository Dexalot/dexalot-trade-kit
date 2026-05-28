import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues): Promise<void> {
  const result = await runner(toolName, { ...v.rest });
  printResult(result, { json: v.json });
}

export async function dispatchTraderHistoryCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get":
    case "list":      await call(runner, "trader_history_get", v); return true;
    case "register":  await call(runner, "trader_history_register", v); return true;
    default:
      return false;
  }
}
