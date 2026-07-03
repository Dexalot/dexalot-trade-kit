---
name: dexalot-pnl
description: 'Use this skill when the user asks for: profit-and-loss for the connected wallet over a specific date range (realized + unrealized PnL broken down by token). Single endpoint: POST signed REST with dateFrom + dateTo body. Requires DEXALOT_PRIVATE_KEY. Do NOT use for: realtime open orders or fills (dexalot-clob), portfolio balance snapshot at one point in time (dexalot-portfolio), aggregate exchange volume or rankings (dexalot-analytics), per-trader APY across a list of addresses (dexalot-leaderboard get-apys), or volume rebate tier state (dexalot-info).'
license: MIT
metadata:
  author: dexalot-trade-kit
  version: '0.1.1'
  homepage: 'https://app.dexalot.com'
  agent:
    requires:
      bins: ['dexalot']
    install:
      - id: npm
        kind: node
        package: '@dexalot/trade-cli@0.1.1'
        bins: ['dexalot']
        label: 'Install dexalot CLI (npm)'
---

# Dexalot PnL CLI

Profit-and-loss for the connected wallet over a date range.

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Wallet required.

## Command

| Command                                                     | Auth | Description                                    |
| ----------------------------------------------------------- | :--: | ---------------------------------------------- |
| `dexalot pnl get --dateFrom 2026-01-01 --dateTo 2026-05-25` |  ✓   | Realized + unrealized PnL broken down by token |

## Workflow

```bash
dexalot pnl get --dateFrom 2026-01-01 --dateTo 2026-05-25 --profile live
```

Returns a per-token PnL object. Useful for monthly reports, tax prep, and strategy attribution.

## Notes

- Single tool, single endpoint. The backend computes PnL by replaying every fill in the window and marking-to-market at the end.
- Long windows (multi-year) may take several seconds — increase `DEXALOT_TIMEOUT_MS` if needed.
