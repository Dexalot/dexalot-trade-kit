#!/usr/bin/env bash
# Read-only smoke: public reads (no wallet) + signed reads (ephemeral throwaway
# wallet, no funds). Nothing is written to ~/.dexalot and no funds move.
#
#   NET="--network devnet" ./scripts/test-reads.sh
set -uo pipefail

CLI="${CLI:-node $(cd "$(dirname "$0")/.." && pwd)/packages/cli/dist/index.js}"
NET="${NET:---network devnet}"
P=0; F=0
run(){ local d="$1"; shift
  if o=$("$@" 2>&1); then
    if echo "$o" | grep -qiE '^Error|KEYSTORE_PASSWORD|not a function|Unknown command'; then
      echo "FAIL  $d :: $(echo "$o" | head -1)"; F=$((F+1))
    else echo "ok    $d"; P=$((P+1)); fi
  else echo "FAIL  $d :: $(echo "$o" | head -1)"; F=$((F+1)); fi; }

echo "### PUBLIC reads (no wallet) ###"
run "market pairs"        $CLI market get-pairs $NET
run "market orderbook"    $CLI market get-orderbook --pair ALOT/USDC $NET
run "market tokens"       $CLI market get-tokens $NET
run "analytics 24h"       $CLI analytics get-24h-stats $NET
run "analytics top-pairs" $CLI analytics get-top-pairs $NET
run "info announcements"  $CLI info get-announcements $NET
run "leaderboard params"  $CLI leaderboard get-table-parameters $NET
run "portfolio prices"    $CLI portfolio get-token-usd-prices $NET
run "swap pairs"          $CLI swap get-pairs --chainIdentifier 43113 $NET

echo "### SIGNED reads (ephemeral throwaway wallet — empty results expected) ###"
export DEXALOT_PRIVATE_KEY=$(node -e "console.log(require('ethers').Wallet.createRandom().privateKey)")
run "portfolio balances"     $CLI portfolio get-all-balances $NET
run "portfolio chain-bal"    $CLI portfolio get-all-chain-balances $NET
run "clob open-orders"       $CLI clob get-open-orders --pair ALOT/USDC $NET
run "clob orders-by-acct"    $CLI clob get-orders-by-account --pair ALOT/USDC $NET
run "transfer history"       $CLI transfer get-combined-transfers $NET
run "transfer token-details" $CLI transfer get-token-details --token ALOT $NET
run "trader-history get"     $CLI trader-history get $NET
unset DEXALOT_PRIVATE_KEY

echo
echo "PASS=$P FAIL=$F"
echo "(Backend 'no data' / 'circuit breaker' / 'Missing required parameter' are not kit bugs.)"
