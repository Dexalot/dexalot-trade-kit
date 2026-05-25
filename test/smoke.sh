#!/usr/bin/env bash
#
# Devnet read-only smoke test for the Dexalot CLI + MCP server.
# Probes the public endpoints across every public-data module and asserts
# the responses are well-formed JSON. Does NOT touch any wallet-signed or
# on-chain endpoint — safe to run in CI without secrets.
#
# Usage:
#   bash test/smoke.sh
#

set -euo pipefail

NETWORK="${SMOKE_NETWORK:-devnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI=("node" "$SCRIPT_DIR/../packages/cli/dist/index.js")

PASS=0
FAIL=0

assert_json() {
  local description="$1"; shift
  echo "→ $description"
  if output=$("${CLI[@]}" "$@" --network "$NETWORK" --json 2>&1); then
    if printf '%s' "$output" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf-8"))' > /dev/null 2>&1; then
      echo "  ok"
      PASS=$((PASS + 1))
      return
    fi
  fi
  echo "  FAIL: $output" >&2
  FAIL=$((FAIL + 1))
}

echo "Dexalot Trade Kit — devnet smoke (network=$NETWORK)"
echo

# ── market (no auth) ──────────────────────────────────────────────────────
assert_json "market get-pairs"                  market get-pairs
assert_json "market get-tokens"                 market get-tokens
assert_json "market get-environments"           market get-environments
assert_json "market get-app-settings"           market get-app-settings
assert_json "market get-blacklisted-addresses"  market get-blacklisted-addresses

# ── analytics (no auth) ───────────────────────────────────────────────────
assert_json "analytics get-24h-stats"           analytics get-24h-stats
assert_json "analytics get-top-pairs"           analytics get-top-pairs
assert_json "analytics get-top-tokens"          analytics get-top-tokens
assert_json "analytics get-daily-volumes"       analytics get-daily-volumes

# ── info (no auth on level 0/4 + tier table) ──────────────────────────────
assert_json "info get-high-priority-announcements"  info get-high-priority-announcements
assert_json "info get-announcements"            info get-announcements
assert_json "info get-volume-rebate-tiers"      info get-volume-rebate-tiers

# ── portfolio (USD prices — no wallet) ────────────────────────────────────
assert_json "portfolio get-token-usd-prices"    portfolio get-token-usd-prices

# ── leaderboard (public reads) ────────────────────────────────────────────
assert_json "leaderboard get-table-parameters"           leaderboard get-table-parameters
assert_json "leaderboard get-breakdown-parameters"       leaderboard get-breakdown-parameters
assert_json "leaderboard get-last-updates-timestamp"     leaderboard get-last-updates-timestamp

# ── vaults (public reads) ─────────────────────────────────────────────────
assert_json "vaults get-all-vaults"             vaults get-all-vaults
assert_json "vaults get-creation-config"        vaults get-creation-config

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  passed: $PASS    failed: $FAIL    network: $NETWORK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
