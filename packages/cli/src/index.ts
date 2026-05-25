/**
 * Dexalot CLI — terminal entry point. Routes `dexalot <module> <action> [flags]`
 * to per-module command handlers, all of which share the underlying
 * `createToolRunner` so the CLI and MCP server return identical results.
 */
import { createRequire } from "node:module";
import {
  DexalotRestClient,
  createToolRunner,
  loadConfig,
  toToolErrorPayload,
  checkForUpdates,
  DexalotMcpError,
} from "@dexalot-trade-kit/core";
import { parseCli } from "./parser.js";
import type { CliValues } from "./parser.js";
import { printHelp } from "./help.js";
import { errorLine, setEnvContext, setJsonEnvEnabled } from "./formatter.js";
import { dispatchMarketCommand } from "./commands/market.js";
import { dispatchPortfolioCommand } from "./commands/portfolio.js";
import { dispatchAnalyticsCommand } from "./commands/analytics.js";
import { dispatchInfoCommand } from "./commands/info.js";
import { dispatchClobCommand } from "./commands/clob.js";
import { dispatchSwapCommand } from "./commands/swap.js";
import { dispatchTransferCommand } from "./commands/transfer.js";
import { dispatchLeaderboardCommand } from "./commands/leaderboard.js";
import { dispatchVaultsCommand } from "./commands/vaults.js";
import { dispatchTraderHistoryCommand } from "./commands/trader-history.js";
import { dispatchRewardsCommand } from "./commands/rewards.js";
import { dispatchPnlCommand } from "./commands/pnl.js";
import { handleConfigCommand } from "./commands/config.js";
import { handleSetupCommand } from "./commands/setup.js";
import { cmdListTools } from "./commands/discovery.js";
import { unknownSubcommand } from "./unknown-command.js";

declare const __GIT_HASH__: string;
const _require = createRequire(import.meta.url);
const CLI_VERSION = (_require("../package.json") as { version: string }).version;
const GIT_HASH: string = typeof __GIT_HASH__ !== "undefined" ? __GIT_HASH__ : "dev";

async function dispatch(v: CliValues): Promise<void> {
  const [module, action, ...rest] = v.positionals;
  if (!module) {
    printHelp(CLI_VERSION, GIT_HASH);
    return;
  }

  // Commands that don't need a config / network (run pre-loadConfig)
  if (module === "setup") {
    handleSetupCommand([action ?? "", ...rest].filter(Boolean));
    return;
  }
  if (module === "config") {
    await handleConfigCommand(action ?? "", rest, { profile: v.profile });
    return;
  }
  if (module === "discovery" || module === "list-tools") {
    const filter = action === "list-tools" || action === "all" ? undefined : action;
    cmdListTools(filter, { json: v.json });
    return;
  }
  if (module === "help") {
    printHelp(CLI_VERSION, GIT_HASH);
    return;
  }

  // Load config + spin up the tool runner shared with the MCP server
  const config = await loadConfig({
    profile: v.profile,
    network: v.network,
    parentEnv: v.parentEnv,
    testnet: v.testnet,
    devnet: v.devnet,
    live: v.live,
    readOnly: v.readOnly,
    verbose: v.verbose,
    sourceTag: "CLI",
  });
  setEnvContext(config);
  setJsonEnvEnabled(v.env);

  const client = new DexalotRestClient(config);
  const runner = createToolRunner(client, config);

  // Per-module dispatch (more modules land in later stages)
  if (!action) {
    unknownSubcommand([module]);
    return;
  }
  switch (module) {
    case "market": {
      const handled = await dispatchMarketCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "portfolio": {
      const handled = await dispatchPortfolioCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "analytics": {
      const handled = await dispatchAnalyticsCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "info": {
      const handled = await dispatchInfoCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "clob": {
      const handled = await dispatchClobCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "swap": {
      const handled = await dispatchSwapCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "transfer": {
      const handled = await dispatchTransferCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "leaderboard": {
      const handled = await dispatchLeaderboardCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "vaults": {
      const handled = await dispatchVaultsCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "trader_history":
    case "trader-history": {
      const handled = await dispatchTraderHistoryCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "rewards": {
      const handled = await dispatchRewardsCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    case "pnl": {
      const handled = await dispatchPnlCommand(action, runner, v);
      if (!handled) unknownSubcommand([module, action]);
      return;
    }
    default:
      unknownSubcommand([module, action]);
  }

}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const v = parseCli(argv);

  if (v.help && v.positionals.length === 0) {
    printHelp(CLI_VERSION, GIT_HASH);
    return;
  }
  if (v.version) {
    process.stdout.write(`${CLI_VERSION} (${GIT_HASH})\n`);
    return;
  }

  checkForUpdates("@dexalot-trade-kit/cli", CLI_VERSION);

  try {
    await dispatch(v);
  } catch (error) {
    if (error instanceof DexalotMcpError) {
      const payload = toToolErrorPayload(error);
      errorLine(`Error: ${payload.message}`);
      if (payload.suggestion) errorLine(`Hint: ${payload.suggestion}`);
      if (payload.traceId) errorLine(`TraceId: ${payload.traceId}`);
    } else {
      errorLine(`Error: ${(error as Error).message ?? String(error)}`);
    }
    errorLine(`Version: dexalot-trade-cli@${CLI_VERSION}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify(toToolErrorPayload(error), null, 2)}\n`);
  process.exitCode = 1;
});
