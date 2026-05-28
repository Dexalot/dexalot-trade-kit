import {
  MODULES,
  DEFAULT_MODULES,
  MODULE_DESCRIPTIONS,
  NETWORK_IDS,
  configFilePath,
} from "@dexalot/trade-core";
import type { ModuleId, CliModuleKey } from "@dexalot/trade-core";

function moduleLine(id: CliModuleKey): string {
  const desc = MODULE_DESCRIPTIONS[id] ?? "";
  return `  ${id.padEnd(16)} ${desc}`;
}

export function printHelp(cliVersion: string, gitHash: string): void {
  const moduleLines = (MODULES as ReadonlyArray<ModuleId>).map((m) => moduleLine(m));
  const aliasLines = [
    moduleLine("clob"),
    moduleLine("config"),
    moduleLine("setup"),
  ];

  const help = `
Dexalot CLI ${cliVersion} (${gitHash})

USAGE
  dexalot <module> <action> [args] [--flag value]
  dexalot setup --client <claude-desktop|cursor|windsurf|vscode|claude-code>
  dexalot config <init|show|set|add-profile|list-profile|use> ...
  dexalot --help [<module>]
  dexalot --version

MODULES
${moduleLines.join("\n")}
${aliasLines.join("\n")}

GLOBAL OPTIONS
  --profile <name>      Profile from ${configFilePath()}  (default: default_profile or "default")
  --network <id>        ${NETWORK_IDS.join(" | ")}  (default: mainnet)
  --testnet / --devnet  Shorthand for --network testnet / --network devnet
  --live                Force mainnet (overrides profile or env)
  --parent-env <name>   Advanced: pin a specific SDK parentEnv string

  --read-only           Refuse to call write-flagged tools
  --json                Print full ToolResult instead of just the data
  --env                 Wrap output as { env, profile, data } for script-friendly piping
  --verbose             Log request/response details to stderr
  --no-log / --log-level <level>   Disable/limit audit logging

  --help, --version

DEFAULT MODULES (when --modules not passed to the MCP server)
  ${DEFAULT_MODULES.join(", ")}

CREDENTIALS (priority: env var > profile in ${configFilePath()})
  DEXALOT_PRIVATE_KEY   0x-prefixed 32-byte hex wallet key (required for signed/on-chain tools)

EXAMPLES
  dexalot --version
  dexalot setup --client claude-code
  dexalot config init
  dexalot market get-pairs --network testnet
  dexalot market get-candles --pair ALOT/USDC --periodfrom 2026-05-01 --periodto 2026-05-25 --intervalnum 1 --intervalstr hours
`;
  process.stdout.write(help);
}
