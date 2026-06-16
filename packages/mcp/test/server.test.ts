import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  WRITE_ACTION_PATTERN,
  REMEDIATION_WARNING,
  applyRemediationWarning,
  createServer,
} from "../src/server.js";
import type { DexalotConfig } from "@dexalot/trade-core";

describe("WRITE_ACTION_PATTERN", () => {
  it("matches messages that hint at write-side remediation", () => {
    assert.ok(WRITE_ACTION_PATTERN.test("cancel open orders before retrying"));
    assert.ok(WRITE_ACTION_PATTERN.test("withdraw positions first"));
    assert.ok(WRITE_ACTION_PATTERN.test("stop the bots before changing strategy"));
  });

  it("does not match benign read-side errors", () => {
    assert.equal(WRITE_ACTION_PATTERN.test("rate limit exceeded, try again later"), false);
    assert.equal(WRITE_ACTION_PATTERN.test("pair not found"), false);
  });
});

describe("applyRemediationWarning", () => {
  it("appends the warning to an existing suggestion when the message hints at writes", () => {
    const out = applyRemediationWarning("Check your balance.", "cancel orders before deposit");
    assert.ok(out);
    assert.ok(out.includes("Check your balance."));
    assert.ok(out.includes(REMEDIATION_WARNING));
  });

  it("returns the suggestion unchanged for non-write messages", () => {
    assert.equal(applyRemediationWarning("Try again.", "network timeout"), "Try again.");
  });

  it("uses the warning as the suggestion when none was provided", () => {
    assert.equal(applyRemediationWarning(undefined, "stop the bots first"), REMEDIATION_WARNING);
  });
});

describe("createServer", () => {
  it("constructs a Server from a read-only config without throwing", () => {
    const config: DexalotConfig = {
      hasAuth: false,
      profile: "default",
      baseUrl: "https://api.dexalot.com/api",
      wsUrl: "wss://api.dexalot.com/api/ws",
      parentEnv: "production-multi-avax",
      network: "mainnet",
      timeoutMs: 15000,
      modules: ["market"],
      readOnly: true,
      rpcOverrides: {},
      timestampedAuth: false,
      sourceTag: "TEST",
      verbose: false,
    };
    const server = createServer(config);
    assert.ok(server);
  });
});
