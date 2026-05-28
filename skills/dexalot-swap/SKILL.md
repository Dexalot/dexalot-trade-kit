---
name: dexalot-swap
description: "Use this skill when the user asks for: Dexalot RFQ swap pairs for a chain (Avalanche/Ethereum/Arbitrum), a swap quote (soft/indicative for price discovery or firm/executable with a maker signature and expiry), or to execute a previously-fetched firm RFQ swap on-chain. RFQ swaps execute atomically against a market maker on a single chain — different from CLOB limit orders. Soft quotes work with just a wallet address; firm quotes and execute require a configured wallet (DEXALOT_PRIVATE_KEY or profile private_key). Do NOT use for limit/market CLOB orders (dexalot-clob), cross-chain deposits or withdrawals between connected chains and the Dexalot subnet (dexalot-transfer), or portfolio balance queries (dexalot-portfolio)."
license: MIT
metadata:
  author: dexalot-trade-kit
  version: "0.1.0"
  homepage: "https://app.dexalot.com"
  agent:
    requires:
      bins: ["dexalot"]
    install:
      - id: npm
        kind: node
        package: "@dexalot/trade-cli@0.1.0"
        bins: ["dexalot"]
        label: "Install dexalot CLI (npm)"
---

# Dexalot Swap (RFQ) CLI

Request-for-Quote swaps against Dexalot's market makers. Unlike CLOB orders (which sit on a per-pair order book), RFQ swaps are bilateral: a maker quotes a firm price, the taker executes against the maker's signed quote within an expiry window. Settlement is on-chain on the quoted chain (not the subnet).

**Skill routing:**
- RFQ swap quotes + execute → `dexalot-swap` (this skill)
- CLOB limit/market orders → `dexalot-clob`
- Cross-chain bridge → `dexalot-transfer`

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Firm quotes and execute require a wallet; soft quotes do not.

## Command Index

| Command | Auth | Description |
|---|:-:|---|
| `dexalot swap get-pairs --chainIdentifier 43114` | — | List RFQ pairs supported by the chain |
| `dexalot swap get-quote --fromToken USDC --toToken AVAX --amount 100 [--firm true] [--chainId 43114]` | mixed | Get a quote (soft default; firm needs wallet) |
| `dexalot swap get-firm-quote --fromToken USDC --toToken AVAX --amount 100 [--chainId 43114]` | ✓ | Convenience for firm-only |
| `dexalot swap execute --quote '<json>' [--waitForReceipt true]` | ✓ | On-chain settlement against MainnetRFQ |

Action aliases: `pairs`, `quote`, `firm-quote`, `execute`.

## Typical workflow

```bash
# 1. List pairs available on Avalanche C-Chain
dexalot swap get-pairs --chainIdentifier 43114

# 2. Get a firm quote (wallet required)
dexalot swap get-firm-quote \
  --fromToken USDC --toToken AVAX --amount 100 --chainId 43114 \
  --profile live > quote.json

# 3. Execute the quote before it expires
dexalot swap execute --quote "$(cat quote.json | jq .data)" --profile live
```

The quote object contains a maker signature and expiry timestamp; pass it verbatim to `swap execute`. Don't modify the quote between fetch and execute — the on-chain check will reject any tampering.

## Notes

- Firm quotes are short-lived (typically <60s). If a quote expires, fetch a fresh one.
- `swap_execute` is `isWrite: true` — dropped from the registry under `--read-only`.
- The chain id is required because RFQ settles per-chain; pass the chain you want the maker to settle on (typically where you hold the `fromToken`).
- Soft quotes do not lock maker inventory; firm quotes do — use soft for price discovery, firm only when you intend to execute promptly.
