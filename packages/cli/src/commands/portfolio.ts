import type { ToolRunner } from "@dexalot/trade-core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues): Promise<void> {
  const result = await runner(toolName, { ...v.rest });
  printResult(result, { json: v.json });
}

export async function dispatchPortfolioCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    case "get-balance":            await call(runner, "portfolio_get_balance", v); return true;
    case "get-all-balances":
    case "balances":               await call(runner, "portfolio_get_all_balances", v); return true;
    case "get-chain-balance":      await call(runner, "portfolio_get_chain_balance", v); return true;
    case "get-chain-balances":     await call(runner, "portfolio_get_chain_balances", v); return true;
    case "get-all-chain-balances": await call(runner, "portfolio_get_all_chain_balances", v); return true;
    case "get-token-usd-prices":
    case "usd-prices":             await call(runner, "portfolio_get_token_usd_prices", v); return true;
    case "get-token-usd-price-history":
    case "usd-price-history":      await call(runner, "portfolio_get_token_usd_price_history", v); return true;
    case "get-token-hourly-usd-price-history":
    case "hourly-usd-price-history": await call(runner, "portfolio_get_token_hourly_usd_price_history", v); return true;
    case "get-balance-proof":
    case "balance-proof":          await call(runner, "portfolio_get_balance_proof", v); return true;
    default:
      return false;
  }
}
