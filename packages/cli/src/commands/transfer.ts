import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues): Promise<void> {
  const result = await runner(toolName, { ...v.rest });
  printResult(result, { json: v.json });
}

export async function dispatchTransferCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "deposit":             await call(runner, "transfer_deposit", v); return true;
    case "withdraw":            await call(runner, "transfer_withdraw", v); return true;
    case "add-gas":             await call(runner, "transfer_add_gas", v); return true;
    case "remove-gas":          await call(runner, "transfer_remove_gas", v); return true;
    case "portfolio":
    case "p2p":
    case "transfer-portfolio":  await call(runner, "transfer_portfolio", v); return true;

    case "get-deposit-bridge-fee":
    case "bridge-fee":          await call(runner, "transfer_get_deposit_bridge_fee", v); return true;
    case "get-token-details":
    case "token-details":       await call(runner, "transfer_get_token_details", v); return true;
    case "get-combined-transfers":
    case "history":             await call(runner, "transfer_get_combined_transfers", v); return true;
    default:
      return false;
  }
}
