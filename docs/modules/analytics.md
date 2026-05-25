# `analytics` module

Aggregate exchange statistics. Public REST, no wallet.

| Tool | CLI | Endpoint |
|---|---|---|
| `analytics_get_daily_volumes` | `dexalot analytics get-daily-volumes` | ANALYTICS_API `GET dailyvolumes` |
| `analytics_get_top_tokens` | `dexalot analytics get-top-tokens` | ANALYTICS_API `GET toptokens` |
| `analytics_get_top_pairs` | `dexalot analytics get-top-pairs` | ANALYTICS_API `GET toppairs` |
| `analytics_get_stats` | `dexalot analytics get-stats [--periodfrom F --periodto T]` | ANALYTICS_API `GET totals/params` |
| `analytics_get_24h_stats` | `dexalot analytics get-24h-stats` | ANALYTICS_API with sentinel `periodfrom=9999-12-31` |
| `analytics_get_burned_fee_data` | `dexalot analytics get-burned-fee-data --periodfrom F --periodto T` | ANALYTICS_API `GET alotburned` |
| `analytics_get_apys` | `dexalot analytics get-apys --traderaddresses A,B --dateperiod P` | TRADE_API `POST apys` |
