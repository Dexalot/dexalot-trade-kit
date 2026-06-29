import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  AbstractSigner,
  hexlify,
  toQuantity,
  resolveAddress,
  type Provider,
  type TypedDataDomain,
  type TypedDataField,
  type TransactionRequest,
  type TransactionResponse,
} from "ethers";
import { ChainError } from "../utils/errors.js";

/**
 * Append a full raw record of a WalletConnect exchange to
 * `~/.dexalot/logs/walletconnect-debug.log` — the exact request params plus
 * everything the wallet/relay returns (all error fields, incl. non-enumerable
 * message/stack and JSON-RPC code/data). On by default; set DEXALOT_WC_DEBUG=0
 * to silence. Best-effort: never throws.
 */
function wcDebugLog(entry: Record<string, unknown>): void {
  if (process.env.DEXALOT_WC_DEBUG === "0") return;
  try {
    const dir = join(homedir(), ".dexalot", "logs");
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    appendFileSync(join(dir, "walletconnect-debug.log"), `${line}\n`, "utf8");
  } catch {
    /* diagnostics must never break the call */
  }
}

/** Reject after `ms` if the underlying WC request hasn't resolved — a dead/offline session never responds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (!ms || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ChainError(`${label}: no response from your wallet within ${Math.round(ms / 1000)}s.`, {
          suggestion:
            "Your WalletConnect session is likely disconnected or your wallet app is offline/backgrounded. " +
            "Reconnect with `wallet connect` (or the wallet_connect tool), make sure the wallet is open, then retry.",
        }),
      );
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Max time to wait for the wallet to respond to a WC request. Defaults to 180s —
 * real mobile approvals take well over a minute. The MCP call stays alive past
 * its 60s default because the server sends progress keepalives during the wait;
 * this only fires for a genuinely unresponsive/dead session.
 */
function wcTimeoutMs(): number {
  const v = Number(process.env.DEXALOT_WC_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 180_000;
}

/** Capture EVERY field of a thrown value (incl. non-enumerable message/stack and RPC code/data). */
function dumpUnknown(err: unknown): Record<string, unknown> {
  if (err === null || err === undefined) return { value: String(err) };
  if (typeof err !== "object") return { value: String(err), kind: typeof err };
  const out: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(err)) {
    try {
      out[key] = (err as Record<string, unknown>)[key];
    } catch {
      out[key] = "<unreadable>";
    }
  }
  return out;
}

/**
 * Sends a single JSON-RPC request over the active WalletConnect session.
 * `caip2ChainId` (e.g. "eip155:432204") targets a specific approved chain;
 * when omitted the session's default chain is used (fine for chain-agnostic
 * `personal_sign`).
 */
export type WcRequestFn = (method: string, params: unknown[], caip2ChainId?: string) => Promise<unknown>;

/**
 * An ethers v6 Signer backed by a WalletConnect session. The private key lives
 * in the user's wallet app; every signature/transaction is a request the wallet
 * approves and (for transactions) broadcasts.
 *
 * - `signMessage` → `personal_sign` (the kit's static "dexalot" auth signature,
 *   and any EIP-191 message). Chain-agnostic.
 * - `signTypedData` → `eth_signTypedData_v4` (EIP-712 order payloads).
 * - `sendTransaction` → `eth_sendTransaction` (the wallet signs AND broadcasts),
 *   routed to the chain of the connected provider. The SDK reconnects this
 *   signer to each operation's own chain provider (`_contractForSigner`), so
 *   every write lands on the right chain: Dexalot L1 ops (withdraw, place/cancel
 *   order, portfolio transfer) AND source-chain deposits. The wallet must have
 *   each chain it transacts on added and approved for the session, with gas.
 * - `signTransaction` (raw, offline) is unsupported — WalletConnect wallets sign
 *   and broadcast together; there is no detached signed-payload step.
 */
export class WalletConnectSigner extends AbstractSigner {
  public readonly address: string;
  private readonly wcRequest: WcRequestFn;

  public constructor(address: string, wcRequest: WcRequestFn, provider: Provider | null = null) {
    super(provider);
    this.address = address;
    this.wcRequest = wcRequest;
  }

  public async getAddress(): Promise<string> {
    return this.address;
  }

  public connect(provider: Provider | null): WalletConnectSigner {
    return new WalletConnectSigner(this.address, this.wcRequest, provider);
  }

  public async signMessage(message: string | Uint8Array): Promise<string> {
    const hex = typeof message === "string" ? `0x${Buffer.from(message, "utf8").toString("hex")}` : hexlify(message);
    return (await withTimeout(
      this.wcRequest("personal_sign", [hex, this.address]),
      wcTimeoutMs(),
      "WalletConnect signature",
    )) as string;
  }

  public async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
  ): Promise<string> {
    const primaryType = Object.keys(types).find((t) => t !== "EIP712Domain") ?? Object.keys(types)[0];
    const payload = JSON.stringify({ domain, types, message: value, primaryType });
    return (await this.wcRequest("eth_signTypedData_v4", [this.address, payload])) as string;
  }

  public async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const provider = this.provider;
    if (!provider) {
      throw new ChainError("WalletConnect signer has no provider; cannot route the transaction to a chain.", {
        suggestion: "This is an internal wiring issue — the SDK should connect the signer to its chain provider.",
      });
    }
    const network = await provider.getNetwork();
    const caip2 = `eip155:${network.chainId}`;

    // Build eth_sendTransaction params from the populated tx. The WALLET fills
    // nonce / gas / gasPrice, so we forward only what we have; omit nonce so the
    // wallet manages it.
    // value/gas use JSON-RPC quantity encoding (minimal hex, no leading zeros).
    const params: Record<string, string> = { from: this.address };
    if (tx.to != null) params.to = await resolveAddress(tx.to, provider);
    if (tx.data != null) params.data = hexlify(tx.data);
    if (tx.value != null) params.value = toQuantity(tx.value);
    if (tx.gasLimit != null) params.gas = toQuantity(tx.gasLimit);

    wcDebugLog({ phase: "eth_sendTransaction.request", chainId: caip2, from: this.address, params });
    let hash: string;
    try {
      hash = (await withTimeout(
        this.wcRequest("eth_sendTransaction", [params], caip2),
        wcTimeoutMs(),
        "WalletConnect transaction",
      )) as string;
      wcDebugLog({ phase: "eth_sendTransaction.result", chainId: caip2, hash });
    } catch (err) {
      // WalletConnect surfaces a JSON-RPC error object ({ code, message, data }),
      // not an Error — decode it so the real reason isn't logged as "[object Object]".
      wcDebugLog({ phase: "eth_sendTransaction.error", chainId: caip2, params, error: dumpUnknown(err) });
      throw new ChainError(`WalletConnect transaction rejected on ${caip2}: ${describeWcError(err)}`, {
        suggestion:
          "If you tapped Reject in your wallet, retry and approve. If it rejected on its own, your wallet " +
          `couldn't process the tx on ${caip2} — ensure that network is added with gas for the fee (and on some ` +
          "wallets, switch to it). Re-pair with `wallet connect` if the chain isn't in the session.",
      });
    }

    // Wrap into a TransactionResponse so the SDK can call `.wait()`.
    const resp = await provider.getTransaction(hash);
    if (resp) return resp;
    return {
      hash,
      from: this.address,
      wait: (confirms?: number) => provider.waitForTransaction(hash, confirms),
    } as unknown as TransactionResponse;
  }

  public async signTransaction(): Promise<string> {
    throw new ChainError("WalletConnect wallets sign and broadcast together — raw signTransaction is not supported.", {
      suggestion: "Use sendTransaction (the wallet signs + broadcasts), which the kit already routes for on-chain writes.",
    });
  }
}

/**
 * Decode a WalletConnect / JSON-RPC error into a readable string. WC rejects come
 * back as `{ code, message, data }`, not an `Error`, so `String(err)` would yield
 * "[object Object]" and hide the real reason (e.g. 4001 user-rejected, fee/gas
 * estimation failure, or an RPC error from the wallet's node).
 */
function describeWcError(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  const o = err as { code?: number | string; message?: string; data?: unknown };
  const parts: string[] = [];
  if (o.code != null) parts.push(`code ${o.code}`);
  if (typeof o.message === "string" && o.message.length > 0) parts.push(o.message);
  if (o.data != null) {
    try {
      parts.push(`data ${typeof o.data === "string" ? o.data : JSON.stringify(o.data)}`);
    } catch {
      /* ignore non-serializable data */
    }
  }
  if (parts.length > 0) return parts.join(": ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
