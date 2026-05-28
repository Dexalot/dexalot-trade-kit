# `market` module

Public market data — pairs, tokens, orderbook, candles, environments, deployments, app settings, blacklist. No wallet required.

| Tool (MCP) | CLI | Route | Source |
|---|---|---|---|
| `market_get_pairs` | `dexalot market get-pairs` | `getClobPairs()` | SDK |
| `market_get_tokens` | `dexalot market get-tokens` | `getTokens()` | SDK |
| `market_get_environments` | `dexalot market get-environments` | `getEnvironments()` | SDK |
| `market_get_orderbook` | `dexalot market get-orderbook --pair P` | `getOrderBook(pair)` | SDK |
| `market_get_deployed_contracts` | `dexalot market get-deployed-contracts` | `GET deployment/params` | REST (`trade`) |
| `market_get_app_settings` | `dexalot market get-app-settings` | `GET settings` | REST (`trade`) |
| `market_get_candles` | `dexalot market get-candles` | `GET candlechart/params` | REST (`trade`) |
| `market_get_oldest_candle_ts` | `dexalot market get-oldest-candle-ts` | `GET candle-min-ts` | REST (`trade`) |
| `market_get_blacklisted_addresses` | `dexalot market get-blacklisted-addresses` | `GET sdnlist` | REST (`trade`) |

**Notes:**
- **SDK-first routing:** `get_pairs`, `get_tokens`, `get_environments`, and `get_orderbook` route through `@dexalot/dexalot-sdk` (no REST re-implementation). `get_orderbook` ships here (previously deferred) because the SDK exposes `getOrderBook` — it reads the on-chain orderbook snapshot, no WebSocket needed.
- **REST-only (no SDK method):** `get_deployed_contracts`, `get_app_settings`, `get_candles`, `get_oldest_candle_ts`, `get_blacklisted_addresses` stay on the public TRADE_API mountpoint. See ARCHITECTURE.md §5 for the full SDK-vs-REST table.
- `get_candles` requires `pair`, `periodfrom`, `periodto`, `intervalnum`, `intervalstr`. `intervalstr` ∈ `{minutes, hours, day}`.
- No auth header required for any market tool — `--read-only` with no key works cleanly.
