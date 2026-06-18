import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { DexalotRestClient } from "../src/client/rest-client.js";
import { DEXALOT_SIGNATURE_MESSAGE } from "../src/constants.js";
import type { DexalotConfig } from "../src/config.js";

const TEST_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

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

test("signs the x-signature auth header eagerly at construction when a wallet exists", async () => {
  const client = new DexalotRestClient(cfg({ privateKey: TEST_KEY, hasAuth: true })) as unknown as {
    signatureHeaderPromise?: Promise<string>;
  };
  // The promise is created in the constructor — before any request is made.
  assert.ok(client.signatureHeaderPromise, "signature header promise created eagerly at construction");
  const header = await client.signatureHeaderPromise;
  const w = new Wallet(TEST_KEY);
  const expected = `${w.address}:${await w.signMessage(DEXALOT_SIGNATURE_MESSAGE)}`;
  assert.equal(header, expected, "header is <address>:<signature> of the static message");
});

test("no wallet -> no eager signing", () => {
  const client = new DexalotRestClient(cfg({ hasAuth: false })) as unknown as {
    signatureHeaderPromise?: Promise<string>;
  };
  assert.equal(client.signatureHeaderPromise, undefined);
});
