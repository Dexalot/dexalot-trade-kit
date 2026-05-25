# `info` module

Announcements + volume rebate tiers + per-account rebate state.

| Tool | CLI | Route |
|---|---|---|
| `info_get_high_priority_announcements` | `dexalot info get-high-priority-announcements` | TRADE_API `GET announcement/0` |
| `info_get_announcements` | `dexalot info get-announcements` | TRADE_API `GET announcement/4` |
| `info_get_volume_rebate_tiers` | `dexalot info get-volume-rebate-tiers` | TRADE_API `GET volrebatetiers` |
| `info_get_account_volume_rebate` | `dexalot info get-account-volume-rebate` | SIGNED_API `GET tradervolrebate` |

**Always call `get-high-priority-announcements` at the start of any trading session** to confirm there are no active incidents.
