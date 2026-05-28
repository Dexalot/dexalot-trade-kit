import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues): Promise<void> {
  const result = await runner(toolName, { ...v.rest });
  printResult(result, { json: v.json });
}

export async function dispatchRewardsCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-subnet-incentives-info":
    case "subnet-incentives-info":  await call(runner, "rewards_get_subnet_incentives_info", v); return true;
    case "get-breakdown-claim-info":
    case "breakdown-claim-info":    await call(runner, "rewards_get_breakdown_claim_info", v); return true;
    case "get-subnet-incentives-signature":
    case "subnet-incentives-signature": await call(runner, "rewards_get_subnet_incentives_signature", v); return true;
    case "get-stake-merkl":
    case "merkl":
    case "stake-merkl":             await call(runner, "rewards_get_stake_merkl", v); return true;
    default:
      return false;
  }
}
