#!/usr/bin/env bash
# Non-destructive end-to-end test of `config init` + client auto-registration.
# Drives the interactive wizard over a PTY against a throwaway HOME, then asserts:
#   - the profile was saved with key_source = "vault" (SDK secrets vault)
#   - the selected client config was written with the DEXALOT_VAULT_KEY env + --read-only
#   - the private key never appeared on screen (masking holds)
# Nothing touches your real ~/.dexalot or client configs.
#
#   ./scripts/test-config-init.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/packages/cli/dist/index.js"
[ -f "$CLI" ] || { echo "build first: pnpm build ($CLI missing)"; exit 1; }
command -v python3 >/dev/null || { echo "python3 required (PTY driver)"; exit 1; }

TH="$(mktemp -d)"
trap 'rm -rf "$TH"' EXIT

HOME="$TH" CLI_PATH="$CLI" python3 - <<'PY'
import os, pty, select, time, signal, sys, json

CLI = os.environ["CLI_PATH"]
KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

# (prompt marker, raw bytes to send). The clients step is the raw-mode checkbox:
# Enter accepts the pre-checked Claude Desktop. No passphrase prompts — the vault
# key is auto-generated.
steps = [
    ("Profile name", "qa\n"),
    ("Network (", "testnet\n"),
    ("leave blank to skip", KEY + "\n"),
    ("Encrypt the key", "Y\n"),
    ("which clients?", "\r"),          # accept default (Claude Desktop checked)
    ("Enable trading", "N\n"),
]

signal.signal(signal.SIGALRM, lambda *a: (_ for _ in ()).throw(TimeoutError()))
signal.alarm(45)
pid, fd = pty.fork()
if pid == 0:
    os.execvp("node", ["node", CLI, "config", "init"])

out = b""; sent = 0
try:
    while sent < len(steps):
        r, _, _ = select.select([fd], [], [], 6)
        if not r:
            break
        c = os.read(fd, 4096)
        if not c:
            break
        out += c
        if steps[sent][0] in out.decode(errors="replace"):
            time.sleep(0.35); os.write(fd, steps[sent][1].encode()); sent += 1; time.sleep(0.35)
    signal.alarm(10)
    while True:
        r, _, _ = select.select([fd], [], [], 3)
        if not r:
            break
        c = os.read(fd, 4096)
        if not c:
            break
        out += c
except Exception:
    pass

text = out.decode(errors="replace")
fails = []

if sent != len(steps):
    fails.append(f"only drove {sent}/{len(steps)} prompts")
if KEY in text:
    fails.append("PRIVATE KEY appeared on screen")

home = os.environ["HOME"]
toml = os.path.join(home, ".dexalot", "config.toml")
vault = os.path.join(home, ".dexalot", "secrets_vault.json")
if not os.path.exists(toml):
    fails.append("~/.dexalot/config.toml not written")
elif 'key_source = "vault"' not in open(toml).read():
    fails.append('profile missing key_source = "vault"')
if not os.path.exists(vault):
    fails.append("secrets_vault.json not written")

desktop = os.path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
if not os.path.exists(desktop):
    fails.append("Claude Desktop config not written (auto-register failed)")
else:
    d = json.load(open(desktop))
    entry = next(iter(d.get("mcpServers", {}).values()), None)
    if not entry:
        fails.append("no server entry in Claude Desktop config")
    else:
        if "DEXALOT_VAULT_KEY" not in (entry.get("env") or {}):
            fails.append("DEXALOT_VAULT_KEY not wired into client config")
        if "--read-only" not in entry.get("args", []):
            fails.append("client config not --read-only by default")

if fails:
    print("FAIL:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("PASS: config init stored the key in the secrets vault, auto-registered Claude")
print("      Desktop (DEXALOT_VAULT_KEY env + --read-only), and never leaked the key.")
PY
