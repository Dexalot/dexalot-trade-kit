import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues): Promise<void> {
  const result = await runner(toolName, { ...v.rest });
  printResult(result, { json: v.json });
}

export async function dispatchVaultsCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-all-vaults":
    case "all":                    await call(runner, "vaults_get_all_vaults", v); return true;
    case "get-vaults-by-account":
    case "by-account":             await call(runner, "vaults_get_vaults_by_account", v); return true;
    case "get-single-vault-by-account":
    case "single":                 await call(runner, "vaults_get_single_vault_by_account", v); return true;
    case "get-vault-assets":
    case "assets":                 await call(runner, "vaults_get_vault_assets", v); return true;
    case "get-vault-transfers":
    case "transfers":              await call(runner, "vaults_get_vault_transfers", v); return true;
    case "get-creation-config":
    case "creation-config":        await call(runner, "vaults_get_creation_config", v); return true;
    case "create-vault":
    case "create":                 await call(runner, "vaults_create_vault", v); return true;
    default:
      return false;
  }
}
