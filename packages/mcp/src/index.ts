import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  loadConfig,
  toToolErrorPayload,
  checkForUpdates,
  TradeLogger,
  runSetup,
  printSetupUsage,
  SUPPORTED_CLIENTS,
  configFilePath,
  MODULES,
  NETWORK_IDS,
  DEFAULT_MODULES,
} from "@dexalot-trade-kit/core";
import type { LogLevel, ClientId } from "@dexalot-trade-kit/core";
import { SERVER_NAME, SERVER_VERSION, GIT_HASH } from "./constants.js";
import { createServer } from "./server.js";

function printHelp(): void {
  const help = `
Usage: dexalot-trade-mcp [options]

Options:
  --modules <list>     Comma-separated list of modules to load.
                       Available: ${MODULES.join(", ")}
                       Alias: "clob" = clob.read + clob.write
                       Special: "all" loads every module
                       Default: ${DEFAULT_MODULES.join(",")}

  --profile <name>     Profile to load from ${configFilePath()}
                       Falls back to default_profile in config, then "default"

  --network <id>       Dexalot network to target: ${NETWORK_IDS.join(", ")} (default: mainnet)
                       mainnet -> api.dexalot.com
                       testnet -> api.dexalot-test.com
                       devnet  -> api.dexalot-dev.com
  --testnet            Shorthand for --network testnet
  --devnet             Shorthand for --network devnet
  --live               Force mainnet (overrides profile network=testnet/devnet)

  --read-only          Expose only read/query tools and disable write operations
  --no-log             Disable audit logging (default: logging enabled)
  --log-level <level>  Minimum log level to write: error, warn, info, debug (default: info)
  --help               Show this help message
  --version            Show version

Credentials (priority: env vars > ${configFilePath()} > none):
  DEXALOT_PRIVATE_KEY  0x-prefixed 32-byte hex wallet private key

Other Environment Variables:
  DEXALOT_NETWORK       Dexalot network (overridden by --network flag)
  DEXALOT_API_BASE_URL  Optional API base URL override (e.g. devnet endpoint)
  DEXALOT_PARENT_ENV    Optional SDK parentEnv override
  DEXALOT_TIMEOUT_MS    Optional request timeout in milliseconds (default: 15000)
  DEXALOT_RPC_<id>      Per-chain RPC URL list (comma-separated)
`;
  process.stdout.write(help);
}

function parseCli(): {
  modules?: string;
  profile?: string;
  network?: string;
  parentEnv?: string;
  testnet: boolean;
  devnet: boolean;
  live: boolean;
  readOnly: boolean;
  noLog: boolean;
  logLevel: string;
  help: boolean;
  version: boolean;
} {
  const parsed = parseArgs({
    options: {
      modules: { type: "string" },
      profile: { type: "string" },
      network: { type: "string" },
      "parent-env": { type: "string" },
      testnet: { type: "boolean", default: false },
      devnet: { type: "boolean", default: false },
      live: { type: "boolean", default: false },
      "read-only": { type: "boolean", default: false },
      "no-log": { type: "boolean", default: false },
      "log-level": { type: "string", default: "info" },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  return {
    modules: parsed.values.modules,
    profile: parsed.values.profile,
    network: parsed.values.network,
    parentEnv: parsed.values["parent-env"],
    testnet: parsed.values.testnet ?? false,
    devnet: parsed.values.devnet ?? false,
    live: parsed.values.live ?? false,
    readOnly: parsed.values["read-only"] ?? false,
    noLog: parsed.values["no-log"] ?? false,
    logLevel: parsed.values["log-level"] ?? "info",
    help: parsed.values.help ?? false,
    version: parsed.values.version ?? false,
  };
}

function handleSetup(): void {
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      client: { type: "string" },
      profile: { type: "string" },
      modules: { type: "string" },
    },
    allowPositionals: false,
  });

  if (!values.client) {
    printSetupUsage();
    return;
  }

  if (!SUPPORTED_CLIENTS.includes(values.client as ClientId)) {
    process.stderr.write(
      `Unknown client: "${values.client}"\nSupported: ${SUPPORTED_CLIENTS.join(", ")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  runSetup({
    client: values.client as ClientId,
    profile: values.profile,
    modules: values.modules,
  });
}

export async function main(): Promise<void> {
  if (process.argv[2] === "setup") {
    handleSetup();
    return;
  }

  checkForUpdates("@dexalot-trade-kit/mcp", SERVER_VERSION);

  const cli = parseCli();

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.version) {
    process.stdout.write(`${SERVER_VERSION} (${GIT_HASH})\n`);
    return;
  }

  const config = await loadConfig({
    modules: cli.modules,
    profile: cli.profile,
    network: cli.network,
    parentEnv: cli.parentEnv,
    testnet: cli.testnet,
    devnet: cli.devnet,
    live: cli.live,
    readOnly: cli.readOnly,
    userAgent: `${SERVER_NAME}/${SERVER_VERSION}`,
    sourceTag: "MCP",
  });
  const logger = cli.noLog ? undefined : new TradeLogger(cli.logLevel as LogLevel);
  const server = createServer(config, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
