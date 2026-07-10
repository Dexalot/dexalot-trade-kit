---
name: dexalot-analytics
description: 'Use this skill when the user asks for: daily trading volumes on the Dexalot L1, top traded tokens by volume or market cap, top trading pairs by volume, aggregate exchange statistics (all-time volume / trades / unique traders / fees), rolling 24-hour stats, ALOT burned-fee history for tokenomics dashboards, or annualized return (APY) for a list of trader addresses over a period. All commands except APY are public REST and require NO wallet. APY (POST) is also public but takes a list of trader addresses to query. Do NOT use for individual orders or fills (dexalot-clob), one-trader leaderboard rewards (dexalot-leaderboard), per-trader PnL (dexalot-pnl), portfolio balances (dexalot-portfolio), or announcements (dexalot-info).'
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

# Dexalot Analytics CLI

Aggregate exchange statistics: daily volumes, top tokens and pairs by activity, rolling 24-hour stats, ALOT burned-fee history, and per-trader APYs.

All commands except `get-apys` are read-only public REST against `/stats/`. No wallet required.

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). No profile setup is needed for any command in this skill.

## Command Index

| Command                                                                              | Description                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `dexalot analytics get-daily-volumes`                                                | Per-day volume series (volume, USD volume, trade count)                        |
| `dexalot analytics get-top-tokens`                                                   | Top tokens ranked by recent volume / market cap                                |
| `dexalot analytics get-top-pairs`                                                    | Top CLOB pairs ranked by recent volume                                         |
| `dexalot analytics get-stats [--periodfrom F] [--periodto T]`                        | Aggregate stats (total volume, fees, trades, traders) for a window or all-time |
| `dexalot analytics get-24h-stats`                                                    | Rolling 24-hour stats (convenience wrapper)                                    |
| `dexalot analytics get-burned-fee-data --periodfrom F --periodto T`                  | ALOT burned over a window                                                      |
| `dexalot analytics get-apys --traderaddresses A,B,... --dateperiod week\|month\|all` | POST: APY per trader (up to ~200 addresses per call)                           |

Action aliases: `daily-volumes`, `top-tokens`, `top-pairs`, `stats`, `24h`, `burned`, `apys`.

## Workflows

### Today's snapshot

```bash
dexalot analytics get-24h-stats
dexalot analytics get-top-pairs | head -20
```

Use 24h-stats for the rolling exchange numbers and top-pairs to see which pairs are driving them.

### Volume trend over the last 30 days

```bash
dexalot analytics get-daily-volumes --json | jq '.data | sort_by(.date) | .[-30:]'
```

The endpoint returns the full series — slice client-side rather than passing a date filter.

### ALOT burn dashboard

```bash
dexalot analytics get-burned-fee-data --periodfrom 2026-01-01 --periodto 2026-05-25
```

Returns per-period burn amounts in ALOT. Sum to compute total burned across the window.

### Compare trader APYs

```bash
dexalot analytics get-apys \
  --traderaddresses 0x111...,0x222...,0x333... \
  --dateperiod month
```

Returns `{ traderaddress, apy }` per trader. Use for leaderboard comparisons and benchmarking strategy performance.

## Notes

- `get-stats` without `periodfrom` / `periodto` returns inception-to-date totals.
- `get-24h-stats` is just a wrapper around `get-stats` with the sentinel `periodfrom=9999-12-31` (Dexalot's "last 24h" marker).
- `get-apys` is the only POST in this module; it's POST because the trader list can exceed URL length limits.
