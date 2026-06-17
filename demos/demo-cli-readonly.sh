#!/usr/bin/env bash
# Demo 1 — CLI, read-only (NO wallet needed).
# Exercises public market + analytics + portfolio-pricing tools.
#
#   bash demos/demo-cli-readonly.sh                 # uses published @dexalot/trade-cli via npx
#   DEXALOT_CLI="node packages/cli/dist/index.js" bash demos/demo-cli-readonly.sh   # local build
#   NETWORK=testnet bash demos/demo-cli-readonly.sh # target testnet/devnet instead of mainnet
set -euo pipefail

CLI="${DEXALOT_CLI:-npx -y @dexalot/trade-cli}"
NETWORK="${NETWORK:-mainnet}"
PAIR="${PAIR:-ALOT/USDC}"
run() { echo; echo "▶ dexalot $*"; $CLI "$@" --network "$NETWORK"; }

echo "=== Dexalot CLI read-only demo ($NETWORK) ==="
$CLI --version

run market get-pairs
run market get-tokens
run market get-environments
run market get-orderbook --pair "$PAIR"
run market get-deployed-contracts --contracttype Portfolio
run market get-candles --pair "$PAIR" \
  --periodfrom "$(date -u -v-2d +%Y-%m-%d 2>/dev/null || date -u -d '2 days ago' +%Y-%m-%d)" \
  --periodto   "$(date -u +%Y-%m-%d)" --intervalnum 1 --intervalstr hours

run analytics get-24h-stats
run analytics get-stats

run portfolio get-token-usd-prices
run portfolio get-token-usd-price-history --token ALOT

run info get-announcements

echo; echo "✅ read-only demo complete"
