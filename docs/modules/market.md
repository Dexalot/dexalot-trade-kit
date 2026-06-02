# `market` module

Public market data — pairs, tokens, orderbook, candles, environments, deployments, app settings, blacklist. No wallet required.

| Tool (MCP) | CLI | Route | Source |
|---|---|---|---|
| `market_get_pairs` | `dexalot market get-pairs` | `getClobPairs()` | SDK |
| `market_get_tokens` | `dexalot market get-tokens` | `getTokens()` | SDK |
| `market_get_environments` | `dexalot market get-environments` | `getEnvironments()` | SDK |
| `market_get_orderbook` | `dexalot market get-orderbook --pair P` | `getOrderBook(pair)` | SDK |
| `market_get_candles` | `dexalot market get-candles` | `getCandles(pair, interval, limit)` | SDK |
| `market_get_deployed_contracts` | `dexalot market get-deployed-contracts` | `getDeployment({env, contractType, returnAbi})` | SDK |
| `market_get_app_settings` | `dexalot market get-app-settings` | `GET settings` | REST (`trade`) |
| `market_get_oldest_candle_ts` | `dexalot market get-oldest-candle-ts` | `GET candle-min-ts` | REST (`trade`) |
| `market_get_blacklisted_addresses` | `dexalot market get-blacklisted-addresses` | `GET sdnlist` | REST (`trade`) |

**Notes:**
- **SDK-first routing:** `get_pairs`, `get_tokens`, `get_environments`, `get_orderbook`, `get_candles`, and `get_deployed_contracts` route through `@dexalot/dexalot-sdk` (no REST re-implementation).
- **REST-only (no SDK method):** `get_app_settings`, `get_oldest_candle_ts`, `get_blacklisted_addresses` stay on the public TRADE_API mountpoint. See ARCHITECTURE.md §5 for the full SDK-vs-REST table.
- `get_deployed_contracts` keeps its public lowercase param names (`env`/`contracttype`/`returnabi`); the handler translates them to the SDK's camelCase opts (`env`/`contractType`/`returnAbi`).
- `get_candles` accepts the same input shape as before (`pair`, `periodfrom`, `periodto`, `intervalnum`, `intervalstr`; `intervalstr` ∈ `{minutes, hours, day}`). The handler translates `(intervalnum, intervalstr)` to the SDK's `interval` shortcut (`'1m'`, `'5m'`, `'15m'`, `'30m'`, `'1h'`, `'4h'`, `'1d'`) and computes `limit` from the time window. SDK enforces a max-500 candle cap.
- No auth header required for any market tool — `--read-only` with no key works cleanly.
