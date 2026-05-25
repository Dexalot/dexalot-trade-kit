# `trader_history` module

Async trader-history export request management.

| Tool | CLI | Route |
|---|---|---|
| `trader_history_get` | `dexalot trader-history get` | SIGNED_API `GET trader-history-requests` |
| `trader_history_register` ⚠ write | `dexalot trader-history register --periodfrom F --periodto T` | SIGNED_API `GET register-trader-history-requests` |

Both require a wallet. `register` is marked `isWrite: true` because it creates state on Dexalot's backend; the actual export is delivered asynchronously via the `get` endpoint.
