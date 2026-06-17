import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet } from "ethers";
import { loadConfig } from "../src/config.js";

// A throwaway test key (never used on-chain).
const TEST_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
// Low scrypt cost keeps the round-trip fast; fromEncryptedJsonSync reads N from the JSON.
const KEYSTORE = new Wallet(TEST_KEY).encryptSync("hunter2", { scrypt: { N: 1 << 10 } });

/** Point HOME (used by os.homedir() -> configFilePath()) at a temp dir holding a config.toml. */
function withConfig(toml: string, run: () => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "dexalot-cfg-"));
  mkdirSync(join(home, ".dexalot"), { recursive: true });
  writeFileSync(join(home, ".dexalot", "config.toml"), toml);
  const savedHome = process.env.HOME;
  const savedKey = process.env.DEXALOT_PRIVATE_KEY;
  const savedPass = process.env.DEXALOT_KEYSTORE_PASSWORD;
  process.env.HOME = home;
  delete process.env.DEXALOT_PRIVATE_KEY; // ensure the profile, not env, is exercised
  return run().finally(() => {
    process.env.HOME = savedHome;
    if (savedKey === undefined) delete process.env.DEXALOT_PRIVATE_KEY;
    else process.env.DEXALOT_PRIVATE_KEY = savedKey;
    if (savedPass === undefined) delete process.env.DEXALOT_KEYSTORE_PASSWORD;
    else process.env.DEXALOT_KEYSTORE_PASSWORD = savedPass;
  });
}

const encryptedToml = `default_profile = "p"\n[profiles.p]\nnetwork = "mainnet"\nencrypted_key = ${JSON.stringify(KEYSTORE)}\n`;

test("encrypted_key decrypts with the right passphrase", async () => {
  await withConfig(encryptedToml, async () => {
    process.env.DEXALOT_KEYSTORE_PASSWORD = "hunter2";
    const cfg = await loadConfig({ readOnly: false });
    assert.equal(cfg.hasAuth, true);
    assert.equal(cfg.privateKey, TEST_KEY);
  });
});

test("encrypted_key without DEXALOT_KEYSTORE_PASSWORD throws", async () => {
  await withConfig(encryptedToml, async () => {
    delete process.env.DEXALOT_KEYSTORE_PASSWORD;
    await assert.rejects(loadConfig({ readOnly: false }), /DEXALOT_KEYSTORE_PASSWORD/);
  });
});

test("encrypted_key with wrong passphrase throws", async () => {
  await withConfig(encryptedToml, async () => {
    process.env.DEXALOT_KEYSTORE_PASSWORD = "wrong";
    await assert.rejects(loadConfig({ readOnly: false }), /decrypt/i);
  });
});

test("no key at all stays read-only (hasAuth false)", async () => {
  await withConfig(`default_profile = "p"\n[profiles.p]\nnetwork = "mainnet"\n`, async () => {
    const cfg = await loadConfig({ readOnly: false });
    assert.equal(cfg.hasAuth, false);
    assert.equal(cfg.privateKey, undefined);
  });
});
