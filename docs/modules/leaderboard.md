# `leaderboard` module

Trader rewards leaderboard + per-trader info + claim signatures.

| Tool | CLI | Route |
|---|---|---|
| `leaderboard_get_top_traders` | `... get-top-traders --token T --pair P --dateperiod D` | TRADE_API `GET toptraderrewards/params` |
| `leaderboard_get_table_parameters` | `... get-table-parameters` | TRADE_API `GET getrewardpairsdates` |
| `leaderboard_get_breakdown_parameters` | `... get-breakdown-parameters` | TRADE_API `GET getrewarddates` |
| `leaderboard_get_last_updates_timestamp` | `... get-last-updates-timestamp` | TRADE_API `GET getrewardlastupdated` |
| `leaderboard_get_single_trader_info` | `... get-single-trader-info --traderaddress A --token T --dateperiod D` | TRADE_API `GET traderreward/params` |
| `leaderboard_get_single_trader_breakdown` | `... get-single-trader-breakdown --traderaddress A --token T --dateperiod D` | TRADE_API `GET traderrewardbreakdown/params` |
| `leaderboard_get_trader_by_account` | `... get-trader-by-account` | SIGNED_API `GET traderreward` |
| `leaderboard_get_trader_subnet_incentives_info` | `... get-trader-subnet-incentives-info` | SIGNED_API `GET reward/earned?type=1` |
| `leaderboard_get_trader_breakdown_claim_info` | `... get-trader-breakdown-claim-info` | SIGNED_API `GET reward/earned` |
| `leaderboard_get_trader_subnet_incentives_signature` | `... get-trader-subnet-incentives-signature` | SIGNED_API `GET reward/signature?type=1` |
| `leaderboard_get_trader_breakdown_claim_signature` | `... get-trader-breakdown-claim-signature` | SIGNED_API `GET reward/signature` |
| `leaderboard_get_apys` | `... get-apys --traderaddresses A,B --dateperiod D` | TRADE_API `POST apys` |

**Overlap with `rewards`:** the subnet-incentives endpoints are also exposed in the `rewards` module under a claim-flow framing. Agents browsing the leaderboard should prefer this skill; agents doing a claim should prefer `dexalot-rewards`.
