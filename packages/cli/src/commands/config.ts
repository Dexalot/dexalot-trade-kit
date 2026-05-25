import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Wallet } from "ethers";
import {
  readFullConfig,
  writeFullConfig,
  configFilePath,
  NETWORK_IDS,
  DEXALOT_NETWORKS,
} from "@dexalot-trade-kit/core";
import type { DexalotProfile, DexalotTomlConfig, NetworkId } from "@dexalot-trade-kit/core";
import { outputLine, errorLine } from "../formatter.js";

function maskKey(key: string): string {
  if (!key) return "(unset)";
  if (key.length <= 12) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function validatePrivateKey(raw: string): string {
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Private key must be a 0x-prefixed 32-byte hex string.");
  }
  return hex;
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const tail = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${question}${tail}: `);
  return answer.trim() || (defaultValue ?? "");
}

function promptSecret(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  // readline doesn't natively support masking on Node; do best-effort: turn off
  // terminal echo while the user types. Falls back to plain on non-TTY input.
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      rl.question(`${question}: `).then(resolve, reject);
      return;
    }
    stdout.write(`${question}: `);
    stdin.setRawMode(true);
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      const ch = chunk.toString("utf8");
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(false);
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(buffer);
      } else if (ch === "") {
        stdin.setRawMode(false);
        stdin.off("data", onData);
        reject(new Error("Aborted"));
      } else if (ch === "") {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          stdout.write("\b \b");
        }
      } else {
        buffer += ch;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

interface InitOptions {
  profile?: string;
  force?: boolean;
}

export async function cmdConfigInit(opts: InitOptions = {}): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    outputLine(`Dexalot CLI — interactive profile setup`);
    outputLine(`Config file: ${configFilePath()}\n`);

    const existing = readFullConfig();
    const profileName = opts.profile
      ?? (await prompt(rl, "Profile name", existing.default_profile ?? "default"));

    if (existing.profiles[profileName] && !opts.force) {
      const confirm = await prompt(rl, `Profile "${profileName}" exists — overwrite? (y/N)`, "N");
      if (confirm.toLowerCase() !== "y") {
        errorLine("Cancelled.");
        return;
      }
    }

    let network = (await prompt(rl, `Network (${NETWORK_IDS.join("/")})`, "mainnet")).toLowerCase();
    while (!NETWORK_IDS.includes(network as NetworkId)) {
      errorLine(`  Unknown network "${network}". Pick one of: ${NETWORK_IDS.join(", ")}`);
      network = (await prompt(rl, "Network", "mainnet")).toLowerCase();
    }
    const networkInfo = DEXALOT_NETWORKS[network as NetworkId];
    outputLine(`  → API: ${networkInfo.apiBaseUrl}`);
    outputLine(`  → SDK parentEnv: ${networkInfo.parentEnv}\n`);

    let privateKey = "";
    while (!privateKey) {
      const raw = await promptSecret(rl, "Wallet private key (0x... or leave blank to skip)");
      if (!raw) {
        outputLine("  Skipping wallet — only public market data will work.\n");
        break;
      }
      try {
        privateKey = validatePrivateKey(raw);
        const wallet = new Wallet(privateKey);
        outputLine(`  → Address: ${wallet.address}\n`);
      } catch (err) {
        errorLine(`  ${(err as Error).message} Try again.`);
        privateKey = "";
      }
    }

    const profile: DexalotProfile = {
      network,
    };
    if (privateKey) profile.private_key = privateKey;

    if (network === "devnet") {
      const apiOverride = await prompt(
        rl,
        "Custom API base URL for devnet (e.g. https://api.dexalot-dev.com/api)",
        DEXALOT_NETWORKS.devnet.apiBaseUrl,
      );
      profile.api_base_url = apiOverride;
    }

    const config: DexalotTomlConfig = {
      default_profile: existing.default_profile ?? profileName,
      profiles: { ...existing.profiles, [profileName]: profile },
    };
    writeFullConfig(config);

    outputLine(`✓ Saved profile "${profileName}" to ${configFilePath()}`);
    outputLine(`  Network:       ${network}`);
    outputLine(`  Private key:   ${maskKey(privateKey)}`);
    outputLine(`  Default:       ${config.default_profile === profileName ? "yes" : "no"}`);
    outputLine(`\nNext: dexalot --profile ${profileName} market get-pairs`);
  } finally {
    rl.close();
  }
}

export function cmdConfigShow(profileName?: string): void {
  const config = readFullConfig();
  const name = profileName ?? config.default_profile ?? "default";
  const profile = config.profiles[name];
  if (!profile) {
    errorLine(`Profile "${name}" not found in ${configFilePath()}.`);
    process.exitCode = 1;
    return;
  }
  outputLine(`Profile: ${name}${name === config.default_profile ? " (default)" : ""}`);
  outputLine(`  network        ${profile.network ?? "(unset, will default to mainnet)"}`);
  outputLine(`  api_base_url   ${profile.api_base_url ?? "(auto from network)"}`);
  outputLine(`  parent_env     ${profile.parent_env ?? "(auto from network)"}`);
  outputLine(`  private_key    ${maskKey(profile.private_key ?? "")}`);
  outputLine(`  timeout_ms     ${profile.timeout_ms ?? "(default 15000)"}`);
}

export function cmdConfigSet(profileName: string, key: string, value: string): void {
  const config = readFullConfig();
  const profile = config.profiles[profileName] ?? {};
  switch (key) {
    case "network":
      if (!NETWORK_IDS.includes(value as NetworkId)) {
        errorLine(`Unknown network "${value}". Use ${NETWORK_IDS.join(", ")}.`);
        process.exitCode = 1; return;
      }
      profile.network = value; break;
    case "api_base_url": profile.api_base_url = value; break;
    case "parent_env":   profile.parent_env = value; break;
    case "private_key":  profile.private_key = validatePrivateKey(value); break;
    case "timeout_ms":   profile.timeout_ms = Number(value); break;
    default:
      errorLine(`Unknown config key "${key}".`);
      process.exitCode = 1; return;
  }
  config.profiles[profileName] = profile;
  writeFullConfig(config);
  outputLine(`✓ Updated ${profileName}.${key}`);
}

export function cmdConfigUse(profileName: string): void {
  const config = readFullConfig();
  if (!config.profiles[profileName]) {
    errorLine(`Profile "${profileName}" does not exist. Create it with: dexalot config init --profile ${profileName}`);
    process.exitCode = 1; return;
  }
  config.default_profile = profileName;
  writeFullConfig(config);
  outputLine(`✓ Default profile is now "${profileName}"`);
}

export function cmdConfigListProfile(): void {
  const config = readFullConfig();
  const names = Object.keys(config.profiles);
  if (names.length === 0) {
    outputLine("No profiles configured. Run: dexalot config init");
    return;
  }
  outputLine(`Profiles in ${configFilePath()}:`);
  for (const name of names) {
    const marker = name === config.default_profile ? " *" : "";
    const network = config.profiles[name]?.network ?? "(default mainnet)";
    outputLine(`  ${name}${marker}    network=${network}`);
  }
  outputLine("\n* = default profile");
}

export function cmdConfigAddProfile(name: string): Promise<void> {
  return cmdConfigInit({ profile: name });
}

export async function handleConfigCommand(
  action: string,
  rest: string[],
  flags: { profile?: string; force?: boolean },
): Promise<void> {
  switch (action) {
    case "init":
      await cmdConfigInit({ profile: flags.profile, force: flags.force });
      return;
    case "show":
      cmdConfigShow(flags.profile ?? rest[0]);
      return;
    case "set": {
      const [key, ...rest2] = rest;
      const value = rest2.join("=");
      const profile = flags.profile ?? readFullConfig().default_profile ?? "default";
      if (!key || !value) {
        errorLine("Usage: dexalot config set <key> <value> [--profile name]");
        process.exitCode = 1; return;
      }
      cmdConfigSet(profile, key, value);
      return;
    }
    case "use":
      if (!rest[0]) {
        errorLine("Usage: dexalot config use <profile>");
        process.exitCode = 1; return;
      }
      cmdConfigUse(rest[0]);
      return;
    case "list-profile":
    case "list":
      cmdConfigListProfile();
      return;
    case "add-profile":
      if (!rest[0]) {
        errorLine("Usage: dexalot config add-profile <name>");
        process.exitCode = 1; return;
      }
      await cmdConfigAddProfile(rest[0]);
      return;
    default:
      errorLine(`Unknown config action "${action}". Try: init, show, set, use, list-profile, add-profile`);
      process.exitCode = 1;
  }
}
