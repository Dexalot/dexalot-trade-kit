---
name: dexalot-clob
description: "Use this skill when the user asks to: place a buy or sell order on Dexalot CLOB (limit or market), cancel one order by internal id or client id, cancel every open order at once, batch-cancel a specific list of orders, replace an open order with new price or amount (atomic cancel+add), batch atomic cancel-and-add for ladder re-pricing, list currently-open orders, list complete order history (any status, paginated), fetch one order's transaction events by id, or look up an order by its client-supplied id. Requires a wallet for all writes and signed reads. Do NOT use for RFQ swap quotes (dexalot-swap), deposits/withdrawals between chains (dexalot-transfer), portfolio balances (dexalot-portfolio), or trader rewards (dexalot-leaderboard / dexalot-rewards)."
license: MIT
metadata:
  author: dexalot-trade-kit
  version: '0.2.0'
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

# Dexalot CLOB CLI

Place, cancel, replace, and query orders on the Dexalot CLOB (Central Limit Order Book). All writes are on-chain transactions against the TradePairs contract on the Dexalot L1; all reads route through `@dexalot/dexalot-sdk` (signed under the hood where required).

**Wallet required for every command in this skill.**

## Preflight

Follow [`../_shared/preflight.md`](../_shared/preflight.md). Confirm a profile with `private_key` exists. Confirm `dexalot info get-high-priority-announcements` is empty before any trading action.

## Sub-modules

- `clob.read` — get-open-orders, get-orders-by-account, get-order, get-order-by-client-id
- `clob.write` — place-order, place-order-list, cancel-order, cancel-order-by-client-id, cancel-all-orders, cancel-list-orders, cancel-list-orders-by-client-id, replace-order, cancel-add-list

When the MCP server runs with `--read-only`, `clob.write` is dropped entirely; only the read tools remain. When the user wants monitoring-only access, run `--modules clob.read,portfolio,market`.

## Read commands

| Command                                                                               | Description                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `dexalot clob get-open-orders [--pair P] [--limit N] [--offset N]`                    | Open + partially-filled orders for the wallet     |
| `dexalot clob get-orders-by-account [--pair P] [--status S] [--limit N] [--offset N]` | Full order history (any status)                   |
| `dexalot clob get-order --orderid 0x...`                                              | Transaction events for one order                  |
| `dexalot clob get-order-by-client-id --clientOrderId 0x...`                           | Look up an order by clientOrderId (on-chain read) |

## Write commands

| Command                                                                                                                                                                                                                        | Description                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `dexalot clob place-order --pair ALOT/USDC --side BUY --amount 100 --price 0.05 [--type LIMIT\|MARKET] [--timeInForce GTC\|FOK\|IOC\|PO] [--stp CANCEL_TAKER\|CANCEL_MAKER\|CANCEL_BOTH\|CANCEL_NONE] [--waitForReceipt true]` | Single order                                  |
| `dexalot clob place-order-list --orders '[{...}, {...}]'`                                                                                                                                                                      | Batch place (same-pair, atomic)               |
| `dexalot clob cancel-order --orderId 0x...`                                                                                                                                                                                    | Cancel by internal id                         |
| `dexalot clob cancel-order-by-client-id --clientOrderId 0x...`                                                                                                                                                                 | Cancel by client id                           |
| `dexalot clob cancel-all-orders`                                                                                                                                                                                               | Emergency flatten                             |
| `dexalot clob cancel-list-orders --orderIds id1,id2,id3`                                                                                                                                                                       | Batch cancel by internal id                   |
| `dexalot clob cancel-list-orders-by-client-id --clientOrderIds id1,id2`                                                                                                                                                        | Batch cancel by client id                     |
| `dexalot clob replace-order --orderId 0x... --newPrice P --newAmount A`                                                                                                                                                        | Atomic cancel + add (single order)            |
| `dexalot clob cancel-add-list --replacements '[...]'`                                                                                                                                                                          | Batch atomic cancel + add (ladder re-pricing) |

`--waitForReceipt true` (default) blocks until the transaction is mined. Set `false` to return as soon as the tx is broadcast.

### Time-in-force & self-trade prevention

`place-order` and per-order entries in `place-order-list` accept two optional modifiers:

- `--timeInForce` (`type2`): `GTC` (default, good-till-cancelled), `FOK` (fill-or-kill), `IOC` (immediate-or-cancel), `PO` (post-only / maker-only). Ignored for MARKET orders.
- `--stp` (self-trade prevention): `CANCEL_TAKER` (default), `CANCEL_MAKER`, `CANCEL_BOTH`, `CANCEL_NONE`.

Per-pair allowed types, Post-Only, FOK and self-trade rules are enforced **on-chain** and surface as revert codes (`T-IVOT-01`, `T-POOA-01`, `T-FOKF-01`, `T-STPR-01`), now rendered as `<code>: <description>`. `replace-order` keeps the original order's type/TIF/stp — to change those, cancel and place fresh.

## Workflows

### Place a LIMIT buy order

```bash
dexalot clob place-order \
  --pair ALOT/USDC --side BUY --amount 100 --price 0.045 \
  --profile live
```

Returns `{ txHash, clientOrderId, operation }`. Save the `clientOrderId` if you want to cancel by that id later.

### Place a MARKET sell

```bash
dexalot clob place-order \
  --pair ALOT/USDC --side SELL --amount 50 --type MARKET \
  --profile live
```

`price` is omitted (the contract uses best available bid).

### Monitor open orders

```bash
dexalot clob get-open-orders --pair ALOT/USDC --profile live
```

Returns an array of canonical Order objects (`internalOrderId`, `clientOrderId`, `price`, `quantity`, `quantityFilled`, `status`, etc.).

### Replace an order at a new price

```bash
dexalot clob replace-order \
  --orderId 0x123... --newPrice 0.047 --newAmount 100 \
  --profile live
```

Atomic — the old order is cancelled and the new one placed in the same transaction.

### Pull every open order at end-of-day

```bash
dexalot clob cancel-all-orders --profile live
```

Use sparingly. Always run `clob get-open-orders` first to confirm what you're about to cancel.

### Batch ladder placement

```bash
dexalot clob place-order-list --orders '[
  {"pair":"ALOT/USDC","side":"BUY","amount":100,"price":0.044},
  {"pair":"ALOT/USDC","side":"BUY","amount":100,"price":0.043},
  {"pair":"ALOT/USDC","side":"BUY","amount":100,"price":0.042}
]' --profile live
```

All three orders submit in one transaction. All must be on the same pair.

## Safety

The Dexalot L1 has fast finality but on-chain operations are still irreversible. The MCP server includes a built-in safeguard: if any tool error message suggests write actions (`cancel`, `close`, `stop`, etc.), the agent is instructed not to auto-execute the suggested remediation — surface to the user instead.

When `--read-only` is set, every `clob.write` tool is removed from the registered set; the agent cannot place or cancel anything even by accident.
