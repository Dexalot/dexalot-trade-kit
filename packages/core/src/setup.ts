import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { configFilePath } from "./config/toml.js";

export type ClientId = "claude-desktop" | "cursor" | "windsurf" | "vscode" | "claude-code";

export interface SetupOptions {
  client: ClientId;
  profile?: string;
  modules?: string;
  /** Add --read-only to the server args (drops write tools). */
  readOnly?: boolean;
  /** Environment variables to attach to the server entry (e.g. DEXALOT_KEYSTORE_PASSWORD). */
  env?: Record<string, string>;
}

export const CLIENT_NAMES: Record<ClientId, string> = {
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  windsurf: "Windsurf",
  vscode: "VS Code",
  "claude-code": "Claude Code CLI",
};

export const SUPPORTED_CLIENTS = Object.keys(CLIENT_NAMES) as ClientId[];

function appData(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
}

const CLAUDE_CONFIG_FILE = "claude_desktop_config.json";

/**
 * Detect Microsoft Store installation of Claude Desktop on Windows.
 * MS Store apps use a sandboxed path:
 *   %LOCALAPPDATA%\Packages\Claude_<hash>\LocalCache\Roaming\Claude\
 * Returns the config file path if found, null otherwise.
 */
function findMsStoreClaudePath(): string | null {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const packagesDir = path.join(localAppData, "Packages");
  try {
    const entries = fs.readdirSync(packagesDir);
    const claudePkg = entries.find((e) => e.startsWith("Claude_"));
    if (claudePkg) {
      const configPath = path.join(
        packagesDir, claudePkg, "LocalCache", "Roaming", "Claude", CLAUDE_CONFIG_FILE,
      );
      // Return if the config file or its parent directory already exists
      if (fs.existsSync(configPath) || fs.existsSync(path.dirname(configPath))) {
        return configPath;
      }
    }
  } catch {
    // Packages dir may not exist or may not be readable
  }
  return null;
}

export function getConfigPath(client: ClientId): string | null {
  const home = os.homedir();
  const platform = process.platform;
  switch (client) {
    case "claude-desktop":
      if (platform === "win32") {
        // Prefer MS Store path if detected, otherwise standard %APPDATA%
        return findMsStoreClaudePath() ?? path.join(appData(), "Claude", CLAUDE_CONFIG_FILE);
      }
      if (platform === "darwin") {
        return path.join(home, "Library", "Application Support", "Claude", CLAUDE_CONFIG_FILE);
      }
      // Linux / other
      return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "Claude", CLAUDE_CONFIG_FILE);
    case "cursor":
      return path.join(home, ".cursor", "mcp.json");
    case "windsurf":
      return path.join(home, ".codeium", "windsurf", "mcp_config.json");
    case "vscode":
      return path.join(process.cwd(), ".mcp.json");
    case "claude-code":
      return null;
  }
}

const NPX_PACKAGE = "@dexalot/trade-mcp";

/**
 * Locate the built MCP server entry when running from a local build (monorepo
 * or a globally-linked install), so we can write a config that launches the
 * *current* code rather than fetching the (maybe unpublished) npm package.
 * Returns null when running from an npx cache / fresh install where the sibling
 * package isn't on disk — callers then fall back to the npx form.
 */
function resolveLocalMcpEntry(): string | null {
  const cliEntry = process.argv[1];
  if (!cliEntry) return null;
  const base = path.dirname(cliEntry);
  const candidates = [
    path.resolve(base, "../../mcp/dist/index.js"),        // monorepo: packages/cli/dist -> packages/mcp/dist
    path.resolve(base, "../../trade-mcp/dist/index.js"),  // installed: @dexalot/trade-cli -> @dexalot/trade-mcp
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Base server invocation: absolute local build if available, else npx (or bare bin for vscode). */
function serverInvocation(client: ClientId): { command: string; baseArgs: string[] } {
  const local = resolveLocalMcpEntry();
  if (local) return { command: process.execPath, baseArgs: [local] };
  if (client === "vscode") return { command: "dexalot-trade-mcp", baseArgs: [] };
  // Standalone apps (Claude Desktop, Cursor, Windsurf) have a limited PATH that
  // often can't find globally-installed npm bins. npx always resolves.
  return { command: "npx", baseArgs: ["-y", NPX_PACKAGE] };
}

function buildEntry(
  client: ClientId,
  toolArgs: string[],
  env?: Record<string, string>
): Record<string, unknown> {
  const { command, baseArgs } = serverInvocation(client);
  const entry: Record<string, unknown> = { command, args: [...baseArgs, ...toolArgs] };
  if (client === "vscode") entry.type = "stdio";
  if (env && Object.keys(env).length > 0) entry.env = env;
  return entry;
}

function buildArgs(options: SetupOptions): string[] {
  const args: string[] = [];
  if (options.readOnly) args.push("--read-only");
  if (options.profile) args.push("--profile", options.profile);
  args.push("--modules", options.modules ?? "all");
  return args;
}

function mergeJsonConfig(
  configPath: string,
  serverName: string,
  entry: Record<string, unknown>
): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let data: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse existing config at ${configPath}`);
    }
    // Backup before modifying
    const backupPath = configPath + ".bak";
    fs.copyFileSync(configPath, backupPath);
    process.stdout.write(`  Backup -> ${backupPath}\n`);
  }

  if (typeof data.mcpServers !== "object" || data.mcpServers === null) {
    data.mcpServers = {};
  }
  (data.mcpServers as Record<string, unknown>)[serverName] = entry;

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function printSetupUsage(): void {
  process.stdout.write(
    `Usage: dexalot-trade-mcp setup --client <client> [--profile <name>] [--modules <list>]\n\n` +
      `Clients:\n` +
      SUPPORTED_CLIENTS.map((id) => `  ${id.padEnd(16)} ${CLIENT_NAMES[id]}`).join("\n") +
      `\n\nOptions:\n` +
      `  --profile <name>   Profile from ${configFilePath()} (default: uses default_profile)\n` +
      `  --modules <list>   Comma-separated modules or "all" (default: all)\n`
  );
}

export function runSetup(options: SetupOptions): void {
  const { client } = options;
  const name = CLIENT_NAMES[client];
  const args = buildArgs(options);
  const serverName = options.profile ? `dexalot-trade-mcp-${options.profile}` : "dexalot-trade-mcp";

  if (client === "claude-code") {
    const { command, baseArgs } = serverInvocation(client);
    const envFlags: string[] = [];
    for (const [k, v] of Object.entries(options.env ?? {})) envFlags.push("--env", `${k}=${v}`);
    const claudeArgs = [
      "mcp",
      "add",
      "--transport",
      "stdio",
      serverName,
      ...envFlags,
      "--",
      command,
      ...baseArgs,
      ...args,
    ];
    // Don't echo env values (they may contain a passphrase) to the terminal.
    process.stdout.write(`Running: claude mcp add ${serverName} -- ${command} ${[...baseArgs, ...args].join(" ")}\n`);
    execFileSync("claude", claudeArgs, { stdio: "inherit" }); // NOSONAR
    process.stdout.write(`✓ Configured ${name}\n`);
    return;
  }

  const configPath = getConfigPath(client);
  if (!configPath) {
    throw new Error(`${name} is not supported on this platform`);
  }

  const entry = buildEntry(client, args, options.env);
  mergeJsonConfig(configPath, serverName, entry);
  process.stdout.write(
    `✓ Configured ${name}\n` +
      `  ${configPath}\n` +
      `  Server args: ${args.join(" ")}\n`
  );
  if (client !== "vscode") {
    process.stdout.write(`  Restart ${name} to apply changes.\n`);
  }
}
