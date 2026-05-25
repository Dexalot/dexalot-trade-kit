import type { ToolRunner } from "@dexalot-trade-kit/core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues, transform?: (rest: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const args = transform ? transform({ ...v.rest }) : { ...v.rest };
  const result = await runner(toolName, args);
  printResult(result, { json: v.json });
}

export async function dispatchSwapCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-pairs":
    case "pairs":            await call(runner, "swap_get_pairs", v); return true;
    case "get-quote":
    case "quote":            await call(runner, "swap_get_quote", v); return true;
    case "get-firm-quote":
    case "firm-quote":       await call(runner, "swap_get_firm_quote", v); return true;
    case "execute":
    case "execute-swap":
      await call(runner, "swap_execute", v, (rest) => ({
        ...rest,
        quote: typeof rest.quote === "string" ? JSON.parse(rest.quote as string) : rest.quote,
      }));
      return true;
    default:
      return false;
  }
}
