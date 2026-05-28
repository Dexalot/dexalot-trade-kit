import type { ToolRunner, ToolArgs } from "@dexalot-trade-kit/core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

/**
 * Translate `dexalot market <action>` flags into the corresponding MCP tool
 * call and print the result.
 *
 * Action names use hyphens at the CLI layer (`get-pairs`) and underscores at
 * the MCP layer (`market_get_pairs`). The CLI router already converts.
 *
 * Each helper here just forwards `cli.rest` to the runner — schema validation
 * happens inside the tool handler (via helpers.ts), so the CLI stays thin.
 */

async function callMarket(
  runner: ToolRunner,
  toolName: string,
  rest: Record<string, string | boolean>,
  v: CliValues,
): Promise<void> {
  const args: ToolArgs = { ...rest };
  const result = await runner(toolName, args);
  printResult(result, { json: v.json });
}

export async function cmdMarketGetPairs(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_pairs", v.rest, v);
}

export async function cmdMarketGetTokens(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_tokens", v.rest, v);
}

export async function cmdMarketGetEnvironments(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_environments", v.rest, v);
}

export async function cmdMarketGetOrderbook(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_orderbook", v.rest, v);
}

export async function cmdMarketGetDeployedContracts(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_deployed_contracts", v.rest, v);
}

export async function cmdMarketGetAppSettings(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_app_settings", v.rest, v);
}

export async function cmdMarketGetCandles(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_candles", v.rest, v);
}

export async function cmdMarketGetOldestCandleTs(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_oldest_candle_ts", v.rest, v);
}

export async function cmdMarketGetBlacklistedAddresses(runner: ToolRunner, v: CliValues): Promise<void> {
  await callMarket(runner, "market_get_blacklisted_addresses", v.rest, v);
}

/**
 * Route `dexalot market <action> ...` to the right command handler.
 * Returns true if handled, false if the action is unknown.
 */
export async function dispatchMarketCommand(
  action: string,
  runner: ToolRunner,
  v: CliValues,
): Promise<boolean> {
  switch (action) {
    case "get-pairs":
    case "pairs":
      await cmdMarketGetPairs(runner, v); return true;
    case "get-tokens":
    case "tokens":
      await cmdMarketGetTokens(runner, v); return true;
    case "get-environments":
    case "environments":
      await cmdMarketGetEnvironments(runner, v); return true;
    case "get-orderbook":
    case "orderbook":
      await cmdMarketGetOrderbook(runner, v); return true;
    case "get-deployed-contracts":
    case "deployed-contracts":
    case "deployment":
      await cmdMarketGetDeployedContracts(runner, v); return true;
    case "get-app-settings":
    case "settings":
      await cmdMarketGetAppSettings(runner, v); return true;
    case "get-candles":
    case "candles":
      await cmdMarketGetCandles(runner, v); return true;
    case "get-oldest-candle-ts":
    case "oldest-candle-ts":
      await cmdMarketGetOldestCandleTs(runner, v); return true;
    case "get-blacklisted-addresses":
    case "blacklist":
    case "sdnlist":
      await cmdMarketGetBlacklistedAddresses(runner, v); return true;
    default:
      return false;
  }
}
