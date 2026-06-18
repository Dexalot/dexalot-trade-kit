import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "smol-toml";
import { ConfigError } from "../utils/errors.js";

export { stringify as tomlStringify };

/** Per-chain RPC override lists, keyed by chain id (numeric string). */
export type RpcOverrideTable = Record<string, string[]>;

export interface DexalotProfile {
  /** 0x-prefixed 32-byte hex private key for signing. Optional when only running read-only public modules. */
  private_key?: string;
  /**
   * Encrypted private key — an ethers (scrypt + AES) JSON keystore string. Written by
   * `dexalot config init` when the user opts to encrypt. Decrypted at runtime with the
   * passphrase from the DEXALOT_KEYSTORE_PASSWORD env var. Preferred over `private_key`
   * for at-rest safety: the file alone is useless without the passphrase.
   */
  encrypted_key?: string;
  /** Network to target. Resolved into api_base_url and SDK parentEnv. */
  network?: string;
  /** Explicit override of the REST API base URL (e.g. for devnet). Takes precedence over network. */
  api_base_url?: string;
  /** Optional SDK parentEnv override for advanced users. */
  parent_env?: string;
  /** Request timeout in milliseconds. */
  timeout_ms?: number;
  /** Per-chain RPC URL lists (failover). Key is the chain id as a string. */
  rpc?: RpcOverrideTable;
  /** HTTP proxy URL. */
  proxy_url?: string;
  /**
   * Use timestamped auth message (`dexalot{ts}`) instead of the static
   * `dexalot` string. Defaults to false. Enable only after the backend
   * confirms acceptance (see SDK CLAUDE.md remediation note).
   */
  timestamped_auth?: boolean;
}

export interface DexalotTomlConfig {
  default_profile?: string;
  profiles: Record<string, DexalotProfile>;
}

export function configFilePath(): string {
  return join(homedir(), ".dexalot", "config.toml");
}

/**
 * Read the full config from ~/.dexalot/config.toml.
 * Returns a config with empty profiles if the file does not exist.
 */
export function readFullConfig(): DexalotTomlConfig {
  const path = configFilePath();
  if (!existsSync(path)) return { profiles: {} };
  const raw = readFileSync(path, "utf-8");
  try {
    return parse(raw) as unknown as DexalotTomlConfig;
  } catch (err) {
    throw new ConfigError(
      `Failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
      "If your private key or values contain special characters:\n" +
      "  - Contains # \\ \"  -> use single quotes:  private_key = '0xabc'\n" +
      "  - Contains '       -> use double quotes:  private_key = \"0xabc\"\n" +
      "Or re-run: dexalot config init",
    );
  }
}

/**
 * Read a profile from ~/.dexalot/config.toml.
 * Returns an empty object if the file does not exist or the profile is not found.
 */
export function readTomlProfile(profileName?: string): DexalotProfile {
  const config = readFullConfig();
  const name = profileName ?? config.default_profile ?? "default";
  return config.profiles?.[name] ?? {};
}

const CONFIG_HEADER =
  "# Dexalot Trade Kit Configuration\n" +
  "# Each [profiles.<name>] block holds wallet credentials and network settings.\n" +
  "# If editing manually, wrap values containing special chars in quotes:\n" +
  "#   private_key = '0xabc'        (if value contains # \\ \")\n" +
  "#   private_key = \"0xabc\"        (if value contains ')\n\n";

/**
 * Write the full config to ~/.dexalot/config.toml.
 * Creates the parent directory if it does not exist.
 */
export function writeFullConfig(config: DexalotTomlConfig): void {
  const path = configFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, CONFIG_HEADER + stringify(config as unknown as Record<string, unknown>), "utf-8");
}
