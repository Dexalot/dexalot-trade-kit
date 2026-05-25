# `market` module

Public market data — pairs, tokens, candles, environments, deployments, app settings, blacklist. No wallet required.

| Tool (MCP) | CLI | Endpoint | Mountpoint |
|---|---|---|---|
| `market_get_pairs` | `dexalot market get-pairs` | `GET pairs` | `trade` |
| `market_get_tokens` | `dexalot market get-tokens` | `GET tokens` | `trade` |
| `market_get_environments` | `dexalot market get-environments` | `GET environments` | `trade` |
| `market_get_deployed_contracts` | `dexalot market get-deployed-contracts` | `GET deployment/params` | `trade` |
| `market_get_app_settings` | `dexalot market get-app-settings` | `GET settings` | `trade` |
| `market_get_candles` | `dexalot market get-candles` | `GET candlechart/params` | `trade` |
| `market_get_oldest_candle_ts` | `dexalot market get-oldest-candle-ts` | `GET candle-min-ts` | `trade` |
| `market_get_blacklisted_addresses` | `dexalot market get-blacklisted-addresses` | `GET sdnlist` | `trade` |

**Notes:**
- `get_orderbook` is deferred to v2 — Dexalot's orderbook is delivered via WebSocket (frontend pattern) or on-chain contract reads (SDK pattern); neither fits the pure-REST market mountpoint.
- `get_candles` requires `pair`, `periodfrom`, `periodto`, `intervalnum`, `intervalstr`. `intervalstr` ∈ `{minutes, hours, day}`.
- All endpoints under the public TRADE_API mountpoint, no auth header required.
