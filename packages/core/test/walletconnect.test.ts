import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WalletConnectSigner } from "../src/client/walletconnect-signer.js";
import { WC_OPTIONAL_CHAINS, WC_WALLET_NETWORKS } from "../src/client/walletconnect-runtime.js";
import { DexalotRestClient } from "../src/client/rest-client.js";
import { DEXALOT_SIGNATURE_MESSAGE } from "../src/constants.js";
import { loadConfig } from "../src/config.js";
import type { DexalotConfig } from "../src/config.js";

const ADDR = "0xceF094b006B3045a89C0e7C37F0083b584C9e8AF";
// hex of the literal string "dexalot"
const DEXALOT_HEX = `0x${Buffer.from("dexalot", "utf8").toString("hex")}`;

function cfg(over: Partial<DexalotConfig>): DexalotConfig {
  return {
    hasAuth: false,
    profile: "test",
    network: "mainnet",
    baseUrl: "https://api.dexalot.com/api",
    wsUrl: "wss://x",
    parentEnv: "production-multi-avax",
    modules: [],
    readOnly: false,
    verbose: false,
    rpcOverrides: {},
    timeoutMs: 15000,
    webUrl: "https://app.dexalot.com",
    ...over,
  } as DexalotConfig;
}

// ---------------------------------------------------------------------------
// WalletConnectSigner
// ---------------------------------------------------------------------------

test("WalletConnectSigner.signMessage issues a personal_sign with the hex message + address", async () => {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const signer = new WalletConnectSigner(ADDR, async (method, params) => {
    calls.push({ method, params });
    return "0xSIGNATURE";
  });

  assert.equal(await signer.getAddress(), ADDR);
  const sig = await signer.signMessage(DEXALOT_SIGNATURE_MESSAGE);
  assert.equal(sig, "0xSIGNATURE");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "personal_sign");
  assert.deepEqual(calls[0]!.params, [DEXALOT_HEX, ADDR]);
});

test("WalletConnectSigner.signTransaction throws (wallet signs + broadcasts together)", async () => {
  const signer = new WalletConnectSigner(ADDR, async () => "0x");
  await assert.rejects(() => signer.signTransaction(), /sign and broadcast together/);
});

test("sendTransaction routes eth_sendTransaction to the provider's chain with hex-encoded params", async () => {
  const calls: Array<{ method: string; params: unknown[]; caip?: string }> = [];
  // Minimal fake provider: a Dexalot L1 chain + a tx hash that isn't yet visible.
  const provider = {
    getNetwork: async () => ({ chainId: 432204n }),
    getTransaction: async () => null,
    waitForTransaction: async () => ({ status: 1 }),
  } as unknown as import("ethers").Provider;
  const signer = new WalletConnectSigner(
    ADDR,
    async (method, params, caip) => {
      calls.push({ method, params, caip });
      return "0xTXHASH";
    },
    provider,
  );

  const resp = await signer.sendTransaction({ to: ADDR, data: "0xdeadbeef", value: 1000n });
  assert.equal(resp.hash, "0xTXHASH");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "eth_sendTransaction");
  assert.equal(calls[0]!.caip, "eip155:432204", "routed to the provider's chain");
  const p = (calls[0]!.params as Record<string, string>[])[0]!;
  assert.equal(p.from, ADDR);
  assert.equal(p.to, ADDR);
  assert.equal(p.data, "0xdeadbeef");
  assert.equal(p.value, "0x3e8", "value hex-encoded (1000)");
  // .wait() resolves via the provider
  const receipt = await (resp as unknown as { wait: () => Promise<{ status: number }> }).wait();
  assert.equal(receipt.status, 1);
});

test("sendTransaction without a provider throws a clear wiring error", async () => {
  const signer = new WalletConnectSigner(ADDR, async () => "0x");
  await assert.rejects(() => signer.sendTransaction({ to: ADDR }), /no provider/i);
});

test("WC chain sets request Dexalot L1 per network + name the wallet networks to add", () => {
  // The session can only sign a write on a chain it requested; Dexalot L1 must
  // be in the optional set for every network.
  assert.ok(WC_OPTIONAL_CHAINS.mainnet.includes("eip155:432204"), "mainnet requests Dexalot L1");
  assert.ok(WC_OPTIONAL_CHAINS.testnet.includes("eip155:432201"), "testnet requests Dexalot L1");
  assert.ok(WC_OPTIONAL_CHAINS.devnet.includes("eip155:432201"), "devnet requests Dexalot L1 (Fuji Subnet)");
  // The add-to-wallet guidance points at the right custom subnet + RPC.
  assert.equal(WC_WALLET_NETWORKS.devnet[0]!.chainId, 432201);
  assert.match(WC_WALLET_NETWORKS.testnet[0]!.rpcUrl, /subnets\.avax\.network\/dexalot\/testnet/);
  assert.equal(WC_WALLET_NETWORKS.mainnet[0]!.chainId, 432204);
});

test("connect() to a source-chain provider routes the tx to THAT chain (deposit case)", async () => {
  // The SDK reconnects the signer to each operation's chain provider; a deposit
  // runs on the source chain (e.g. Avalanche 43114), not Dexalot L1.
  const calls: Array<{ caip?: string }> = [];
  const base = new WalletConnectSigner(ADDR, async (_m, _p, caip) => {
    calls.push({ caip });
    return "0xH";
  });
  const avax = {
    getNetwork: async () => ({ chainId: 43114n }),
    getTransaction: async () => null,
    waitForTransaction: async () => ({ status: 1 }),
  } as unknown as import("ethers").Provider;
  const connected = base.connect(avax);
  await connected.sendTransaction({ to: ADDR });
  assert.equal(calls[0]!.caip, "eip155:43114", "deposit routed to the source chain, not Dexalot L1");
});

// ---------------------------------------------------------------------------
// REST client injection (WalletConnect path)
// ---------------------------------------------------------------------------

test("setMessageSigner injects a signer WITHOUT eager signing (no wallet prompt at startup)", async () => {
  const client = new DexalotRestClient(cfg({ walletConnect: true })) as unknown as {
    signatureHeaderPromise?: Promise<string>;
    ensureSignatureHeader(): Promise<string>;
    walletAddress: string | undefined;
  };
  // No private key → nothing signed at construction.
  assert.equal(client.signatureHeaderPromise, undefined);

  let signCount = 0;
  client.setMessageSigner(
    { getAddress: async () => ADDR, signMessage: async () => { signCount++; return "0xWCSIG"; } },
    ADDR,
  );
  // Still lazy — injecting must not trigger a signature.
  assert.equal(signCount, 0, "no signature requested on injection");
  assert.equal(client.signatureHeaderPromise, undefined);
  assert.equal(client.walletAddress, ADDR);

  // First actual need triggers exactly one signature, formatted <address>:<sig>.
  const header = await client.ensureSignatureHeader();
  assert.equal(header, `${ADDR}:0xWCSIG`);
  assert.equal(signCount, 1);
});

test("clearMessageSigner drops the signer + cached header (disconnect path)", async () => {
  const client = new DexalotRestClient(cfg({ walletConnect: true })) as unknown as {
    signatureHeaderPromise?: Promise<string>;
    ensureSignatureHeader(): Promise<string>;
    clearMessageSigner(): void;
    walletAddress: string | undefined;
    config: { walletError?: unknown };
  };
  client.setMessageSigner({ getAddress: async () => ADDR, signMessage: async () => "0xWCSIG" } as never, ADDR);
  await client.ensureSignatureHeader(); // cache it
  assert.ok(client.signatureHeaderPromise, "header cached before disconnect");

  client.clearMessageSigner();
  assert.equal(client.signatureHeaderPromise, undefined, "cached header cleared");
  assert.equal(client.walletAddress, undefined, "address cleared");
  // No signer → signed endpoints surface the no-wallet guidance again.
  await assert.rejects(() => client.ensureSignatureHeader(), /wallet/i);
});

// ---------------------------------------------------------------------------
// Config: key_source = "walletconnect"
// ---------------------------------------------------------------------------

function withWcProfile(
  body: string,
  env: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "dexalot-wc-"));
  mkdirSync(join(home, ".dexalot"), { recursive: true });
  writeFileSync(join(home, ".dexalot", "config.toml"), body);
  const saved = { HOME: process.env.HOME, PID: process.env.DEXALOT_WC_PROJECT_ID, KEY: process.env.DEXALOT_PRIVATE_KEY };
  process.env.HOME = home;
  delete process.env.DEXALOT_PRIVATE_KEY;
  if (env.DEXALOT_WC_PROJECT_ID === undefined) delete process.env.DEXALOT_WC_PROJECT_ID;
  else process.env.DEXALOT_WC_PROJECT_ID = env.DEXALOT_WC_PROJECT_ID;
  return run().finally(() => {
    process.env.HOME = saved.HOME;
    if (saved.PID === undefined) delete process.env.DEXALOT_WC_PROJECT_ID;
    else process.env.DEXALOT_WC_PROJECT_ID = saved.PID;
    if (saved.KEY === undefined) delete process.env.DEXALOT_PRIVATE_KEY;
    else process.env.DEXALOT_PRIVATE_KEY = saved.KEY;
  });
}

test("loadConfig: key_source=walletconnect → walletConnect flag, no key, hasAuth deferred", async () => {
  await withWcProfile(
    `default_profile = "p"\n[profiles.p]\nnetwork = "mainnet"\nkey_source = "walletconnect"\nwc_project_id = "myprojectid"\n`,
    { DEXALOT_WC_PROJECT_ID: undefined },
    async () => {
      const c = await loadConfig({ readOnly: false });
      assert.equal(c.walletConnect, true);
      assert.equal(c.hasAuth, false, "no signer until paired");
      assert.equal(c.privateKey, undefined, "no key on disk");
      assert.equal(c.wcProjectId, "myprojectid");
    },
  );
});

test("loadConfig: wc_project_id falls back to DEXALOT_WC_PROJECT_ID env", async () => {
  await withWcProfile(
    `default_profile = "p"\n[profiles.p]\nnetwork = "testnet"\nkey_source = "walletconnect"\n`,
    { DEXALOT_WC_PROJECT_ID: "env-pid" },
    async () => {
      const c = await loadConfig({ readOnly: false });
      assert.equal(c.walletConnect, true);
      assert.equal(c.wcProjectId, "env-pid");
    },
  );
});
