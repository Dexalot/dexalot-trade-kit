import * as ethers from "ethers";
import {
  CLOB_DEFAULT_SUB_MODULES,
  CLOB_SUB_MODULE_IDS,
  DEFAULT_MODULES,
  DEFAULT_SOURCE_TAG,
  DEXALOT_NETWORKS,
  MODULES,
  NETWORK_IDS,
  type ModuleId,
  type NetworkId,
} from "./constants.js";
import { ConfigError } from "./utils/errors.js";
import { readFullConfig } from "./config/toml.js";
import type { DexalotProfile, RpcOverrideTable } from "./config/toml.js";

export interface CliOptions {
  modules?: string;
  readOnly: boolean;
  /** --testnet: shorthand for --network testnet. */
  testnet?: boolean;
  /** --devnet: shorthand for --network devnet. */
  devnet?: boolean;
  /** --live: force mainnet even if the profile says testnet/devnet. */
  live?: boolean;
  /** Explicit --network value (mainnet|testnet|devnet). Mutually exclusive with --testnet/--devnet. */
  network?: string;
  profile?: string;
  /** Advanced: override the SDK parentEnv string. Not normally needed. */
  parentEnv?: string;
  userAgent?: string;
  sourceTag?: string;
  verbose?: boolean;
}

export interface DexalotConfig {
  /** Wallet private key (0x-prefixed). Optional when only public modules are enabled. */
  privateKey?: string;
  /** Derived wallet address. Available only when privateKey is set. */
  address?: string;
  /** True when a wallet/private key was successfully loaded. */
  hasAuth: boolean;
  /** Resolved profile name (used by setup and log lines). */
  profile: string;
  /** REST API base URL — includes the `/api` suffix. */
  baseUrl: string;
  /** WebSocket URL for the active network (v2 use). */
  wsUrl: string;
  /** SDK `parentEnv` for the @dexalot/dexalot-sdk DexalotClient constructor. */
  parentEnv: string;
  network: NetworkId;
  timeoutMs: number;
  modules: ModuleId[];
  readOnly: boolean;
  rpcOverrides: RpcOverrideTable;
  timestampedAuth: boolean;
  userAgent?: string;
  sourceTag: string;
  proxyUrl?: string;
  verbose: boolean;
}

/**
 * Expand a single module shorthand into its concrete sub-module IDs.
 * Returns the expanded IDs, or null if the input is not a shorthand.
 */
function expandShorthand(moduleId: string): ModuleId[] | null {
  if (moduleId === "all") return [...MODULES];
  if (moduleId === "clob" || moduleId === "clob.all") return [...CLOB_SUB_MODULE_IDS];
  return null;
}

function parseModuleList(rawModules?: string): ModuleId[] {
  if (!rawModules || rawModules.trim().length === 0) {
    return [...DEFAULT_MODULES];
  }

  const trimmed = rawModules.trim().toLowerCase();
  const requested = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (requested.length === 0) {
    return [...DEFAULT_MODULES];
  }

  const deduped = new Set<ModuleId>();
  for (const moduleId of requested) {
    const expanded = expandShorthand(moduleId);
    if (expanded) {
      expanded.forEach((sub) => deduped.add(sub));
      continue;
    }
    if (!MODULES.includes(moduleId as ModuleId)) {
      throw new ConfigError(
        `Unknown module "${moduleId}".`,
        `Use one of: ${MODULES.join(", ")}, "clob", "clob.all", or "all".`,
      );
    }
    deduped.add(moduleId as ModuleId);
  }

  return Array.from(deduped);
}

function validatePrivateKeyHex(raw: string): string {
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ConfigError(
      "Invalid private key.",
      "Provide a 0x-prefixed 32-byte hex string via DEXALOT_PRIVATE_KEY or the profile's private_key field.",
    );
  }
  return hex;
}

function loadWallet(toml: DexalotProfile): { privateKey?: string; hasAuth: boolean } {
  // 1. Plaintext key from env or profile (back-compat, CI, power users).
  const raw = process.env.DEXALOT_PRIVATE_KEY?.trim() ?? toml.private_key?.trim();
  if (raw) return { privateKey: validatePrivateKeyHex(raw), hasAuth: true };

  // 2. Encrypted keystore in the profile — decrypt with the passphrase from the env.
  const encrypted = toml.encrypted_key?.trim();
  if (encrypted) {
    const passphrase = process.env.DEXALOT_KEYSTORE_PASSWORD;
    if (!passphrase) {
      throw new ConfigError(
        "Profile has an encrypted_key but DEXALOT_KEYSTORE_PASSWORD is not set.",
        "Set DEXALOT_KEYSTORE_PASSWORD to the passphrase you chose during `dexalot config init` " +
          "(e.g. source it from your OS keychain). Or run a read-only profile with no key at all.",
      );
    }
    let decrypted: ethers.HDNodeWallet | ethers.Wallet;
    try {
      decrypted = ethers.Wallet.fromEncryptedJsonSync(encrypted, passphrase);
    } catch {
      throw new ConfigError(
        "Failed to decrypt encrypted_key — wrong passphrase or corrupted keystore.",
        "Check DEXALOT_KEYSTORE_PASSWORD, or re-run `dexalot config init` to recreate the profile.",
      );
    }
    return { privateKey: validatePrivateKeyHex(decrypted.privateKey), hasAuth: true };
  }

  // 3. No key at all — read-only is fine.
  return { hasAuth: false };
}

function resolveNetwork(cli: CliOptions, toml: DexalotProfile): NetworkId {
  const aliasFlags = [cli.network, cli.testnet ? "testnet" : undefined, cli.devnet ? "devnet" : undefined]
    .filter((v): v is string => Boolean(v));
  if (aliasFlags.length > 1) {
    throw new ConfigError(
      "--network, --testnet, and --devnet are mutually exclusive.",
      "Pass only one network selector.",
    );
  }
  if (cli.live && (cli.testnet || cli.devnet || (cli.network && cli.network !== "mainnet"))) {
    throw new ConfigError(
      "--live conflicts with the requested network.",
      "Use --live alone to force mainnet, or pass an explicit non-mainnet selector — not both.",
    );
  }

  if (cli.live === true) return "mainnet";
  const raw = aliasFlags[0]?.trim() ?? process.env.DEXALOT_NETWORK?.trim() ?? toml.network ?? "mainnet";
  if (!NETWORK_IDS.includes(raw as NetworkId)) {
    throw new ConfigError(
      `Unknown network "${raw}".`,
      `Use one of: ${NETWORK_IDS.join(", ")}.`,
    );
  }
  return raw as NetworkId;
}

function resolveBaseUrl(network: NetworkId, tomlBaseUrl?: string): string {
  const raw = process.env.DEXALOT_API_BASE_URL?.trim() ?? tomlBaseUrl ?? DEXALOT_NETWORKS[network].apiBaseUrl;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    throw new ConfigError(
      `Invalid base URL "${raw}".`,
      "DEXALOT_API_BASE_URL must start with http:// or https://",
    );
  }
  return raw.replace(/\/+$/, "");
}

function resolveParentEnv(cli: CliOptions, toml: DexalotProfile, network: NetworkId): string {
  return cli.parentEnv?.trim() ??
    process.env.DEXALOT_PARENT_ENV?.trim() ??
    toml.parent_env?.trim() ??
    DEXALOT_NETWORKS[network].parentEnv;
}

function normalizeRpcOverrides(toml: DexalotProfile): RpcOverrideTable {
  const out: RpcOverrideTable = {};

  // From TOML: rpc.<chainId> = ["...", "..."]
  if (toml.rpc) {
    for (const [chainId, urls] of Object.entries(toml.rpc)) {
      if (!/^\d+$/.test(chainId)) continue;
      if (!Array.isArray(urls)) continue;
      out[chainId] = urls.filter((u) => typeof u === "string" && u.length > 0);
    }
  }

  // From env: DEXALOT_RPC_<chainId> = "url1,url2"
  for (const [key, value] of Object.entries(process.env)) {
    const m = /^DEXALOT_RPC_(\d+)$/.exec(key);
    if (!m || !value) continue;
    out[m[1]!] = value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return out;
}

/**
 * Credential priority (highest to lowest):
 *   1. Environment variables (DEXALOT_PRIVATE_KEY)
 *   2. ~/.dexalot/config.toml - profile selected by cli.profile or default_profile
 *
 * Network priority (highest to lowest):
 *   1. --network / --testnet / --devnet CLI flag
 *   2. DEXALOT_NETWORK env var
 *   3. toml profile network field
 *   4. default: "mainnet"
 *
 * Base URL priority (highest to lowest):
 *   1. DEXALOT_API_BASE_URL env var (explicit override, e.g. devnet)
 *   2. toml profile api_base_url
 *   3. network's apiBaseUrl (auto-derived)
 */
export async function loadConfig(cli: CliOptions): Promise<DexalotConfig> {
  const config = readFullConfig();
  const profileName = cli.profile ?? config.default_profile ?? "default";
  const toml = config.profiles?.[profileName] ?? {};
  const wallet = loadWallet(toml);

  const network = resolveNetwork(cli, toml);
  const baseUrl = resolveBaseUrl(network, toml.api_base_url);
  const parentEnv = resolveParentEnv(cli, toml, network);
  const wsUrl = DEXALOT_NETWORKS[network].wsUrl;

  const rawTimeout = process.env.DEXALOT_TIMEOUT_MS
    ? Number(process.env.DEXALOT_TIMEOUT_MS)
    : (toml.timeout_ms ?? 15_000);
  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    throw new ConfigError(
      `Invalid timeout value "${rawTimeout}".`,
      "Set DEXALOT_TIMEOUT_MS as a positive integer in milliseconds.",
    );
  }

  const rawProxyUrl = toml.proxy_url?.trim();
  if (rawProxyUrl && !rawProxyUrl.startsWith("http://") && !rawProxyUrl.startsWith("https://")) {
    throw new ConfigError(
      `Invalid proxy URL "${rawProxyUrl}".`,
      "proxy_url must start with http:// or https://. SOCKS proxies are not supported.",
    );
  }

  void CLOB_DEFAULT_SUB_MODULES; // referenced for compile-time tracking

  return {
    ...wallet,
    profile: profileName,
    baseUrl,
    wsUrl,
    parentEnv,
    network,
    timeoutMs: Math.floor(rawTimeout),
    modules: parseModuleList(cli.modules),
    readOnly: cli.readOnly,
    rpcOverrides: normalizeRpcOverrides(toml),
    timestampedAuth: toml.timestamped_auth ?? false,
    userAgent: cli.userAgent,
    sourceTag: cli.sourceTag ?? DEFAULT_SOURCE_TAG,
    proxyUrl: rawProxyUrl || undefined,
    verbose: cli.verbose ?? false,
  };
}
