import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { SignClient } from "@walletconnect/sign-client";
import QRCode from "qrcode";
import { ConfigError } from "../utils/errors.js";
import { WalletConnectSigner } from "./walletconnect-signer.js";

const RELAY_METHODS = [
  "personal_sign",
  "eth_sendTransaction",
  "eth_signTypedData_v4",
  // EIP-3085/3326 — let the kit add the Dexalot L1 (a custom subnet) to the
  // wallet and switch to it, so writes can be signed without manual setup.
  "wallet_addEthereumChain",
  "wallet_switchEthereumChain",
];
const RELAY_EVENTS = ["chainChanged", "accountsChanged"];
/**
 * Dexalot's Reown (WalletConnect) projectId — bundled so the kit pairs out of
 * the box with no per-user setup. A projectId is a public relay identifier, not
 * a secret. Override per-profile with `wc_project_id` or `DEXALOT_WC_PROJECT_ID`.
 */
const DEFAULT_PROJECT_ID = "0e780d86141d85695a05e43d3d00403f";

/** Default on-disk path for the WalletConnect session store. */
export function walletConnectStorePath(): string {
  return join(homedir(), ".dexalot", "walletconnect.json");
}

/**
 * Minimal durable key-value store for SignClient, backed by a single JSON file
 * so a WalletConnect session survives across CLI invocations and MCP restarts
 * (the default in-memory store would force re-pairing every process).
 */
class FileKeyValueStorage {
  private readonly path: string;
  private store: Record<string, unknown>;

  public constructor(path: string) {
    this.path = path;
    this.store = {};
    if (existsSync(path)) {
      try {
        this.store = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      } catch {
        this.store = {};
      }
    }
  }

  private flush(): void {
    // 0o700 dir + 0o600 file: the store holds the live session's symKey secrets.
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    // Atomic write (temp + rename) so a crash mid-write can't truncate the
    // store, and an explicit chmod every flush because writeFileSync's `mode`
    // is honored only on first creation, not on rewrite of an existing file.
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.store), { mode: 0o600 });
    try {
      chmodSync(tmp, 0o600);
    } catch {
      // non-POSIX filesystem; best-effort
    }
    renameSync(tmp, this.path);
  }

  public async getKeys(): Promise<string[]> {
    return Object.keys(this.store);
  }
  public async getEntries<T = unknown>(): Promise<[string, T][]> {
    return Object.entries(this.store) as [string, T][];
  }
  public async getItem<T = unknown>(key: string): Promise<T | undefined> {
    return this.store[key] as T | undefined;
  }
  public async setItem<T = unknown>(key: string, value: T): Promise<void> {
    this.store[key] = value;
    this.flush();
  }
  public async removeItem(key: string): Promise<void> {
    delete this.store[key];
    this.flush();
  }
}

export interface WalletConnectManagerOptions {
  projectId?: string;
  storagePath?: string;
  /** Required CAIP-2 chains the wallet MUST support to settle a session (default: Ethereum mainnet — universal). */
  requiredChains?: string[];
  /** Optional CAIP-2 chains (Dexalot L1 / Avalanche). Wallets lacking them still connect. */
  optionalChains?: string[];
}

interface WcSession {
  topic: string;
  namespaces: Record<string, { accounts: string[] }>;
}

/**
 * Owns a single WalletConnect session: pair (mint URI), restore from disk,
 * produce a {@link WalletConnectSigner}, and disconnect. Used by the CLI
 * `wallet` commands and the MCP `wallet_connect` tools.
 */
export class WalletConnectManager {
  private readonly projectId: string;
  private readonly storagePath: string;
  private readonly requiredChains: string[];
  private readonly optionalChains: string[];
  private client?: Awaited<ReturnType<typeof SignClient.init>>;
  private session?: WcSession;
  private keepaliveTimer?: ReturnType<typeof setInterval>;

  public constructor(opts: WalletConnectManagerOptions = {}) {
    this.projectId = opts.projectId?.trim() || process.env.DEXALOT_WC_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
    this.storagePath = opts.storagePath ?? walletConnectStorePath();
    this.requiredChains = opts.requiredChains ?? ["eip155:1"];
    this.optionalChains = opts.optionalChains ?? [];
  }

  /** Init the SignClient (durable storage) and restore an existing session if one persists. */
  public async init(): Promise<void> {
    if (this.client) return;
    this.client = await SignClient.init({
      projectId: this.projectId,
      storage: new FileKeyValueStorage(this.storagePath),
      metadata: {
        name: "Dexalot Trade Kit",
        description: "AI trading toolkit for the Dexalot DEX",
        url: "https://app.dexalot.com",
        icons: ["https://app.dexalot.com/favicon.ico"],
      },
    });
    const existing = this.client.session.getAll();
    if (existing.length > 0) {
      this.session = existing[existing.length - 1] as unknown as WcSession;
      this.startKeepalive();
    }
  }

  public get connected(): boolean {
    return Boolean(this.session);
  }

  /** The connected wallet address, or null if no session. */
  public get address(): string | null {
    const acct = this.session?.namespaces.eip155?.accounts[0];
    return acct ? acct.split(":")[2]! : null;
  }

  /** CAIP-2 chains the wallet approved for this session (e.g. ["eip155:1", "eip155:432201"]). */
  public get sessionChains(): string[] {
    const accounts = this.session?.namespaces.eip155?.accounts ?? [];
    return [...new Set(accounts.map((a) => a.split(":").slice(0, 2).join(":")))];
  }

  /**
   * Start a pairing. Returns the `wc:` URI to surface to the user and an
   * `approval()` promise that resolves once they approve in their wallet.
   */
  /**
   * @param extraChains additional CAIP-2 chains to request (e.g. the live set
   *   derived from the SDK for the active network), merged with the configured
   *   required/optional chains.
   */
  public async connect(extraChains: string[] = []): Promise<{ uri: string; approval: () => Promise<string> }> {
    await this.init();
    // Modern WalletConnect deprecates `requiredNamespaces` (it warns and folds
    // them into optional anyway). Advertise every chain as OPTIONAL — the wallet
    // approves whatever subset it has, so a session always settles (no `5100
    // unsupportedChains` rejection). `eip155:1` is universal, so accounts are
    // never empty. The auth `personal_sign` is chain-agnostic regardless.
    const chains = [...new Set([...this.requiredChains, ...this.optionalChains, ...extraChains])];
    const { uri, approval } = await this.client!.connect({
      optionalNamespaces: {
        eip155: { chains, methods: RELAY_METHODS, events: RELAY_EVENTS },
      },
    });
    if (!uri) throw new ConfigError("WalletConnect did not return a pairing URI.");
    const settle = async (): Promise<string> => {
      this.session = (await approval()) as unknown as WcSession;
      this.startKeepalive();
      return this.address!;
    };
    return { uri, approval: settle };
  }

  /** Build a signer for the current session, or null if not connected. */
  public getSigner(): WalletConnectSigner | null {
    if (!this.session || !this.client) return null;
    const acct = this.session.namespaces.eip155!.accounts[0]!; // eip155:<chainId>:<address>
    const [, chainId, address] = acct.split(":");
    const topic = this.session.topic;
    const defaultCaip = `eip155:${chainId}`;
    // chain-agnostic ops (personal_sign) use the session's default chain;
    // eth_sendTransaction passes the target chain explicitly.
    const wcRequest = (method: string, params: unknown[], caip2ChainId?: string): Promise<unknown> =>
      this.client!.request({ topic, chainId: caip2ChainId ?? defaultCaip, request: { method, params } });
    return new WalletConnectSigner(address!, wcRequest);
  }

  /**
   * Ask the wallet to add a custom network (EIP-3085 `wallet_addEthereumChain`)
   * over the live session, so it can subsequently sign on that chain. Sent on an
   * already-approved chain. Wallets that support it prompt the user; some then
   * extend the session namespaces (we refresh to pick that up), others require a
   * reconnect afterwards. Throws if the wallet rejects or lacks support.
   */
  public async addNetwork(net: { chainId: number; name: string; rpcUrl: string; nativeSymbol: string }): Promise<void> {
    if (!this.client || !this.session) throw new ConfigError("No active WalletConnect session.");
    const onChain = this.sessionChains[0] ?? "eip155:1";
    await this.client.request({
      topic: this.session.topic,
      chainId: onChain,
      request: {
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${net.chainId.toString(16)}`,
            chainName: net.name,
            rpcUrls: [net.rpcUrl],
            nativeCurrency: { name: net.nativeSymbol, symbol: net.nativeSymbol, decimals: 18 },
          },
        ],
      },
    });
    this.refreshSession();
  }

  /**
   * Keep the session warm with a periodic relay ping so it isn't dropped during
   * idle stretches (the main cause of "session went stale between actions").
   * `.unref()` so it never keeps a one-shot CLI process alive. Idempotent.
   */
  private startKeepalive(): void {
    if (this.keepaliveTimer) return;
    this.keepaliveTimer = setInterval(() => {
      if (this.client && this.session) {
        this.client.ping({ topic: this.session.topic }).catch(() => {
          /* a failed ping surfaces as a clear error on the next real request */
        });
      }
    }, 4 * 60 * 1000);
    this.keepaliveTimer.unref?.();
  }

  /** Re-read the session from the client so namespace extensions (session_update) are reflected. */
  private refreshSession(): void {
    if (this.client && this.session) {
      try {
        this.session = this.client.session.get(this.session.topic) as unknown as WcSession;
      } catch {
        // keep the existing snapshot
      }
    }
  }

  public async disconnect(): Promise<void> {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
    if (this.client && this.session) {
      try {
        await this.client.disconnect({ topic: this.session.topic, reason: { code: 6000, message: "User disconnected" } });
      } catch {
        // session may already be gone; ignore
      }
    }
    this.session = undefined;
  }
}

/** Render a `wc:` URI as a scannable Unicode QR for a terminal. */
export function qrToTerminal(text: string): Promise<string> {
  return QRCode.toString(text, { type: "utf8" });
}

/** Render a `wc:` URI as a base64 PNG (no data: prefix) for MCP image content. */
export async function qrToPngBase64(text: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(text, { width: 320, margin: 2 });
  return dataUrl.split(",")[1]!;
}
