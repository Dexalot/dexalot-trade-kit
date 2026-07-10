---
name: dexalot-trader-history
description: "Use this skill when the user asks for: list of previously submitted trader-history export requests (id, period, status, download links) for the connected wallet, or to register a new trader-history export request for a date range. Dexalot's backend processes export requests asynchronously, so registering returns immediately and the export becomes available later. Both endpoints require a wallet (DEXALOT_PRIVATE_KEY). Do NOT use for live order history (dexalot-clob get-orders-by-account), cross-chain transfer history (dexalot-transfer get-combined-transfers), portfolio balances (dexalot-portfolio), or PnL over a date range (dexalot-pnl)."
license: MIT
metadata:
  author: dexalot-trade-kit
  version: '0.1.2'
  homepage: 'https://app.dexalot.com'
  agent:
    requires:
      bins: ['dexalot']
    install:
      - id: npm
        kind: node
        package: '@dexalot/trade-cli@0.1.2'
        bins: ['dexalot']
        label: 'Install dexalot CLI (npm)'
---

# Dexalot Trader History CLI

Manage asynchronous trader-history export requests.

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Both commands require a wallet.

## Command index

| Command                                                                         | Auth | Description                                   |
| ------------------------------------------------------------------------------- | :--: | --------------------------------------------- |
| `dexalot trader-history get`                                                    |  ✓   | List previous export requests for the account |
| `dexalot trader-history register --periodfrom 2026-01-01 --periodto 2026-05-25` |  ✓   | Register a new export request                 |

## Workflow

```bash
# Submit a new request for Jan-May 2026
dexalot trader-history register \
  --periodfrom 2026-01-01 \
  --periodto 2026-05-25 \
  --profile live

# Poll until the export is ready
dexalot trader-history get --profile live
```

## Notes

- `register` is the only `isWrite: true` tool here (state-change on the backend). Dropped under `--read-only`.
- Exports may take minutes; the agent should poll `get` periodically rather than blocking on a single call.
