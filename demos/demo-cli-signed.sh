#!/usr/bin/env bash
# Demo 2 — CLI, signed reads (needs a wallet; nothing is written on-chain).
# Shows portfolio balances + order history + transfer history. All read-only:
# the wallet is only used to sign the API auth header.
#
# Provide the key one of two ways:
#   A) env var:   export DEXALOT_PRIVATE_KEY=0x...   (or 64-hex without 0x)
#   B) a profile: dexalot config init   then run with  PROFILE=myprofile
#
#   DEXALOT_PRIVATE_KEY=0x... NETWORK=testnet bash demos/demo-cli-signed.sh
#   PROFILE=dev NETWORK=devnet bash demos/demo-cli-signed.sh
#   DEXALOT_CLI="node packages/cli/dist/index.js" ... bash demos/demo-cli-signed.sh   # local build
set -euo pipefail

CLI="${DEXALOT_CLI:-npx -y @dexalot/trade-cli}"
NETWORK="${NETWORK:-testnet}"
PAIR="${PAIR:-ALOT/USDC}"
PROFILE_ARGS=()
[ -n "${PROFILE:-}" ] && PROFILE_ARGS=(--profile "$PROFILE")

if [ -z "${DEXALOT_PRIVATE_KEY:-}" ] && [ -z "${PROFILE:-}" ]; then
  echo "Set DEXALOT_PRIVATE_KEY=0x... or PROFILE=<name> first (see header)." >&2
  exit 1
fi

run() { echo; echo "▶ dexalot $*"; $CLI "$@" "${PROFILE_ARGS[@]}" --network "$NETWORK"; }

echo "=== Dexalot CLI signed-read demo ($NETWORK) ==="
run portfolio get-all-balances
run portfolio get-all-chain-balances
run clob get-orders-by-account --pair "$PAIR" --limit 5
run clob get-open-orders --pair "$PAIR"
run transfer get-combined-transfers --limit 5
# Windowed history (unix seconds): last 90 days
FROM=$(( $(date +%s) - 90*86400 ))
run transfer get-combined-transfers --fromTs "$FROM" --toTs "$(date +%s)" --limit 5

echo; echo "✅ signed-read demo complete (no on-chain writes performed)"
