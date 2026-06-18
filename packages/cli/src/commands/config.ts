import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { Wallet } from "ethers";
import {
  readFullConfig,
  writeFullConfig,
  configFilePath,
  NETWORK_IDS,
  DEXALOT_NETWORKS,
  runSetup,
  SUPPORTED_CLIENTS,
  CLIENT_NAMES,
} from "@dexalot/trade-core";
import type { DexalotProfile, DexalotTomlConfig, NetworkId, ClientId } from "@dexalot/trade-core";
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

/**
 * Read a secret with the typed input fully hidden. The readline interface is
 * created with a muteable output stream (see `createPrompter`); here we print
 * the prompt to the real stdout, mute readline's echo while it reads the line,
 * then unmute. The TTY does not echo because readline holds raw mode, and
 * readline's own software echo is swallowed by the muted output -- so nothing
 * reaches the screen or scrollback. (An earlier version printed `*` from a
 * second stdin listener while readline was still echoing, leaking the key.)
 */
async function promptSecret(p: Prompter, question: string): Promise<string> {
  if (!stdin.isTTY) {
    return p.rl.question(`${question}: `);
  }
  stdout.write(`${question} (hidden, input not shown): `);
  p.setMuted(true);
  try {
    return await p.rl.question("");
  } finally {
    p.setMuted(false);
    stdout.write("\n");
  }
}

interface Prompter {
  rl: ReturnType<typeof createInterface>;
  setMuted: (muted: boolean) => void;
  close: () => void;
}

/** Build a readline interface whose output can be muted (to hide secrets). */
function createPrompter(): Prompter {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer | string, _enc: unknown, cb: (e?: Error | null) => void): void {
      if (!muted) stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: stdin, output, terminal: Boolean(stdin.isTTY) });
  return { rl, setMuted: (m) => { muted = m; }, close: () => rl.close() };
}

interface InitOptions {
  profile?: string;
  force?: boolean;
}

export async function cmdConfigInit(opts: InitOptions = {}): Promise<void> {
  const p = createPrompter();
  const rl = p.rl;
  let regCtx:
    | { profileName: string; isDefaultProfile: boolean; hasKey: boolean; encrypted: boolean; passphrase: string }
    | null = null;
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
      const raw = await promptSecret(p, "Wallet private key (0x... or leave blank to skip)");
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
    let encrypted = false;
    let passphrase = "";
    if (privateKey) {
      const enc = await prompt(
        rl,
        "Encrypt the key at rest with a passphrase? (Y/n)",
        "Y",
      );
      if (enc.toLowerCase() !== "n") {
        let keystore = "";
        while (!keystore) {
          const pass = await promptSecret(p, "Passphrase");
          if (!pass) {
            errorLine("  Passphrase cannot be empty. Try again.");
            continue;
          }
          const confirm = await promptSecret(p, "Confirm passphrase");
          if (pass !== confirm) {
            errorLine("  Passphrases did not match. Try again.");
            continue;
          }
          outputLine("  Encrypting (scrypt)…");
          keystore = new Wallet(privateKey).encryptSync(pass);
          passphrase = pass;
        }
        profile.encrypted_key = keystore;
        encrypted = true;
        outputLine("  → Stored as encrypted_key (passphrase-protected).\n");
      } else {
        profile.private_key = privateKey;
        outputLine("  → Stored as plaintext private_key.\n");
      }
    }

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
    outputLine(
      `  Private key:   ${privateKey ? (encrypted ? "encrypted (passphrase-protected)" : maskKey(privateKey)) : "(none — read-only)"}`,
    );
    const isDefaultProfile = config.default_profile === profileName;
    outputLine(`  Default:       ${isDefaultProfile ? "yes" : "no"}`);
    regCtx = { profileName, isDefaultProfile, hasKey: Boolean(privateKey), encrypted, passphrase };
  } finally {
    p.close();
  }

  // Client registration runs AFTER the readline prompter is closed, so the
  // raw-mode checkbox owns stdin without readline echoing keystrokes underneath.
  if (regCtx) {
    await registerClients(regCtx);
    // The default profile is used implicitly, so don't make the user type --profile.
    const profileFlag = regCtx.isDefaultProfile ? "" : ` --profile ${regCtx.profileName}`;
    outputLine(`\nNext: dexalot${profileFlag} market get-pairs`);
  }
}

/**
 * Multi-select checkbox over a TTY: ↑/↓ to move, space to toggle, enter to
 * confirm. Returns the selected values. On a non-TTY (piped input) it returns
 * the pre-checked defaults so scripts stay deterministic.
 */
function checkboxSelect(
  title: string,
  items: { value: string; label: string; checked?: boolean }[],
): Promise<string[]> {
  const checked = new Set(items.filter((i) => i.checked).map((i) => i.value));
  if (!stdin.isTTY) return Promise.resolve([...checked]);

  return new Promise((resolve, reject) => {
    let cursor = 0;
    stdout.write(`${title}\n  (↑/↓ move · space toggle · enter confirm)\n`);
    const render = (first = false): void => {
      if (!first) stdout.write(`[${items.length}A`); // move cursor up N lines
      for (let i = 0; i < items.length; i++) {
        const pointer = i === cursor ? "›" : " ";
        const box = checked.has(items[i]!.value) ? "◉" : "◯";
        stdout.write(`\r[2K ${pointer} ${box} ${items[i]!.label}\n`);
      }
    };
    render(true);
    stdout.write("[?25l"); // hide cursor
    const wasRaw = Boolean(stdin.isRaw);
    stdin.setRawMode(true);
    stdin.resume();
    let buf = "";
    const cleanup = (): void => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdout.write("[?25h"); // show cursor
    };
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString("utf8");
      while (buf.length > 0) {
        if (buf === "" || buf === "[") return; // wait for the rest of an escape seq
        if (buf.startsWith("[A") || buf.startsWith("[B")) {
          cursor = buf[2] === "A" ? (cursor - 1 + items.length) % items.length : (cursor + 1) % items.length;
          buf = buf.slice(3);
          render();
          continue;
        }
        const ch = buf[0]!;
        buf = buf.slice(1);
        if (ch === " ") {
          const v = items[cursor]!.value;
          if (checked.has(v)) checked.delete(v); else checked.add(v);
          render();
        } else if (ch === "\r" || ch === "\n") {
          cleanup();
          resolve(items.filter((i) => checked.has(i.value)).map((i) => i.value));
          return;
        } else if (ch === "") {
          cleanup();
          reject(new Error("Aborted"));
          return;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function registerClients(ctx: {
  profileName: string;
  isDefaultProfile: boolean;
  hasKey: boolean;
  encrypted: boolean;
  passphrase: string;
}): Promise<void> {
  const items = SUPPORTED_CLIENTS.map((c) => ({
    value: c,
    label: CLIENT_NAMES[c],
    checked: c === "claude-desktop", // sensible default; user toggles others
  }));
  let selected: string[];
  try {
    selected = await checkboxSelect("\nRegister the MCP server with which clients?", items);
  } catch {
    return; // aborted (Ctrl-C)
  }
  if (selected.length === 0) {
    outputLine("  No clients selected — register later with: dexalot setup --client <name>");
    return;
  }

  // Safe default: read-only. Trading (place/cancel orders, deposits, swaps) is
  // an explicit opt-in, and only meaningful when a wallet is configured.
  let readOnly = true;
  if (ctx.hasKey) {
    const rl2 = createInterface({ input: stdin, output: stdout });
    const ans = (await rl2.question("Enable trading (write tools: orders, deposits, swaps)? (y/N): ")).trim();
    rl2.close();
    readOnly = ans.toLowerCase() !== "y";
  }

  const env = ctx.encrypted && ctx.passphrase ? { DEXALOT_KEYSTORE_PASSWORD: ctx.passphrase } : undefined;
  // Only pin --profile when it isn't the default — otherwise the server picks up
  // default_profile implicitly (and the entry is named "dexalot-trade-mcp", not
  // "...-<profile>"). Users only specify a profile to override the default.
  const profile = ctx.isDefaultProfile ? undefined : ctx.profileName;
  for (const client of selected) {
    try {
      runSetup({ client: client as ClientId, profile, modules: "all", readOnly, env });
    } catch (err) {
      errorLine(`  Could not register ${CLIENT_NAMES[client as ClientId]}: ${(err as Error).message}`);
    }
  }
  if (env) {
    outputLine(
      "  Note: your passphrase was written into each selected client's config so the\n" +
        "  server can decrypt the key at launch. Anyone who can read that file + your\n" +
        "  ~/.dexalot/config.toml can use the wallet — keep both private.",
    );
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
  outputLine(`  encrypted_key  ${profile.encrypted_key ? "set (passphrase-protected)" : "(unset)"}`);
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
