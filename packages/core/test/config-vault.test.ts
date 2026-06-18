import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSecretsVaultKey, secretsVaultSet } from "@dexalot/dexalot-sdk/secrets-vault";
import { loadConfig } from "../src/config.js";

const TEST_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

/**
 * Set up a temp HOME with a `key_source = "vault"` profile and a secrets vault
 * holding TEST_KEY, then run `fn` with DEXALOT_VAULT_KEY controlled by the test.
 */
function withVault(vaultKeyEnv: string | undefined, run: () => Promise<void>): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), "dexalot-vault-"));
  mkdirSync(join(home, ".dexalot"), { recursive: true });
  const vaultPath = join(home, ".dexalot", "secrets_vault.json");
  const realKey = generateSecretsVaultKey();
  secretsVaultSet(vaultPath, "PRIVATE_KEY_p", TEST_KEY, realKey);
  writeFileSync(
    join(home, ".dexalot", "config.toml"),
    `default_profile = "p"\n[profiles.p]\nnetwork = "mainnet"\nkey_source = "vault"\nvault_secret_name = "PRIVATE_KEY_p"\n`,
  );
  const saved = { HOME: process.env.HOME, KEY: process.env.DEXALOT_PRIVATE_KEY, VK: process.env.DEXALOT_VAULT_KEY };
  process.env.HOME = home;
  delete process.env.DEXALOT_PRIVATE_KEY;
  // The "real" vault key when the test wants a correct unlock; otherwise a literal.
  if (vaultKeyEnv === "CORRECT") process.env.DEXALOT_VAULT_KEY = realKey;
  else if (vaultKeyEnv === undefined) delete process.env.DEXALOT_VAULT_KEY;
  else process.env.DEXALOT_VAULT_KEY = vaultKeyEnv;
  return run().finally(() => {
    process.env.HOME = saved.HOME;
    saved.KEY === undefined ? delete process.env.DEXALOT_PRIVATE_KEY : (process.env.DEXALOT_PRIVATE_KEY = saved.KEY);
    saved.VK === undefined ? delete process.env.DEXALOT_VAULT_KEY : (process.env.DEXALOT_VAULT_KEY = saved.VK);
  });
}

test("vault profile decrypts with the correct DEXALOT_VAULT_KEY", async () => {
  await withVault("CORRECT", async () => {
    const cfg = await loadConfig({ readOnly: false });
    assert.equal(cfg.hasAuth, true);
    assert.equal(cfg.privateKey, TEST_KEY);
  });
});

test("vault profile without DEXALOT_VAULT_KEY does NOT throw (deferred error, public reads work)", async () => {
  await withVault(undefined, async () => {
    const cfg = await loadConfig({ readOnly: false });
    assert.equal(cfg.hasAuth, false);
    assert.equal(cfg.privateKey, undefined);
    assert.match(cfg.walletError?.message ?? "", /DEXALOT_VAULT_KEY/);
  });
});

test("vault profile with wrong DEXALOT_VAULT_KEY does NOT throw (deferred error)", async () => {
  await withVault(generateSecretsVaultKey(), async () => {
    const cfg = await loadConfig({ readOnly: false });
    assert.equal(cfg.hasAuth, false);
    assert.match(cfg.walletError?.message ?? "", /secrets vault/i);
  });
});
