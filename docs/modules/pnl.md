# `pnl` module

Realized + unrealized PnL for the connected wallet over a date range.

| Tool | CLI | Route |
|---|---|---|
| `pnl_get` | `dexalot pnl get --dateFrom 2026-01-01 --dateTo 2026-05-25` | SIGNED_API `POST pnl` |

Single tool. POST body carries `dateFrom` and `dateTo`. Long windows (multi-year) may take several seconds; bump `DEXALOT_TIMEOUT_MS` if needed.
