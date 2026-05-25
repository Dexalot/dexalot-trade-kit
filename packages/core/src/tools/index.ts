import type { DexalotConfig } from "../config.js";
import type { DexalotRestClient } from "../client/rest-client.js";
import { DexalotContractClient } from "../client/contract-client.js";
import { MODULES, type ModuleId } from "../constants.js";
import type { ToolSpec, ToolArgs } from "./types.js";
import { registerMarketTools } from "./market.js";
import { registerPortfolioTools } from "./portfolio.js";
import { registerAnalyticsTools } from "./analytics.js";
import { registerInfoTools } from "./info.js";
import { registerClobReadTools } from "./clob-read.js";
import { registerClobWriteTools } from "./clob-write.js";
import { registerSwapTools } from "./swap.js";
import { registerTransferTools } from "./transfer.js";
import { registerLeaderboardTools } from "./leaderboard.js";
import { registerVaultsTools } from "./vaults.js";
import { registerTraderHistoryTools } from "./trader-history.js";
import { registerRewardsTools } from "./rewards.js";
import { registerPnlTools } from "./pnl.js";

/**
 * Return specs for every registered tool across all modules.
 *
 * Modules are added incrementally as each stage lands.
 */
export function allToolSpecs(): ToolSpec[] {
  return [
    ...registerMarketTools(),
    ...registerClobReadTools(),
    ...registerClobWriteTools(),
    ...registerSwapTools(),
    ...registerPortfolioTools(),
    ...registerTransferTools(),
    ...registerAnalyticsTools(),
    ...registerInfoTools(),
    ...registerLeaderboardTools(),
    ...registerVaultsTools(),
    ...registerTraderHistoryTools(),
    ...registerRewardsTools(),
    ...registerPnlTools(),
  ];
}

export function buildTools(config: DexalotConfig): ToolSpec[] {
  const enabledModules = new Set(config.modules);
  const tools = allToolSpecs().filter((tool) => enabledModules.has(tool.module));
  if (!config.readOnly) {
    return tools;
  }
  return tools.filter((tool) => !tool.isWrite);
}

export interface ToolResult {
  endpoint: string;
  requestTime: string;
  data: unknown;
}

export type ToolRunner = (toolName: string, args: ToolArgs) => Promise<ToolResult>;

/**
 * Create a function that can call any registered tool by name.
 * All modules are enabled regardless of config.modules, since CLI
 * controls which commands to expose at the routing level.
 */
export function createToolRunner(client: DexalotRestClient, config: DexalotConfig): ToolRunner {
  const fullConfig: DexalotConfig = { ...config, modules: [...MODULES] as ModuleId[], readOnly: false };
  const contract = new DexalotContractClient(fullConfig);
  const tools = allToolSpecs();
  const toolMap = new Map<string, ToolSpec>(tools.map((t) => [t.name, t]));

  return async (toolName: string, args: ToolArgs): Promise<ToolResult> => {
    const tool = toolMap.get(toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    const result = await tool.handler(args, { config: fullConfig, client, contract });
    return result as ToolResult;
  };
}
