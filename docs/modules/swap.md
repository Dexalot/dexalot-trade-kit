# `swap` module

RFQ swaps against Dexalot market makers — atomic settlement on a single chain. Differs from `clob` which sits on a per-pair order book on the subnet.

| Tool | CLI | Route |
|---|---|---|
| `swap_get_pairs` | `dexalot swap get-pairs --chainIdentifier <id\|name>` | SDK `getSwapPairs` |
| `swap_get_quote` | `dexalot swap get-quote --fromToken T --toToken T --amount N [--firm true]` | SDK `getSwapQuote` |
| `swap_get_firm_quote` | `dexalot swap get-firm-quote --fromToken T --toToken T --amount N` | SDK `getSwapFirmQuote` |
| `swap_execute` ⚠ write | `dexalot swap execute --quote '<json>'` | SDK `executeRFQSwap` |

**Notes:**
- Soft quotes (`firm=false`, the default) are indicative; firm quotes are time-bounded maker commitments.
- Firm quotes and `swap_execute` require a wallet.
- `--read-only` drops `swap_execute`.
