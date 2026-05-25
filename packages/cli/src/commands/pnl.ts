import type { ToolRunner } from "@dexalot-trade-kit/core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

export async function dispatchPnlCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get":
    case "pnl":
    case "report": {
      const result = await runner("pnl_get", { ...v.rest });
      printResult(result, { json: v.json });
      return true;
    }
    default:
      return false;
  }
}
