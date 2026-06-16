# `clob` module

CLOB trading — split into `clob.read` (queries) and `clob.write` (state changes). All require a wallet.

## `clob.read` (4 tools)

| Tool | CLI | Route |
|---|---|---|
| `clob_get_open_orders` | `dexalot clob get-open-orders` | SDK `getOpenOrders` |
| `clob_get_orders_by_account` | `dexalot clob get-orders-by-account` | SDK `getOrderHistory` |
| `clob_get_order` | `dexalot clob get-order` | SDK `getOrder` |
| `clob_get_order_by_client_id` | `dexalot clob get-order-by-client-id` | SDK `getOrderByClientId` |

## `clob.write` (9 tools, all `isWrite: true`)

| Tool | CLI | SDK method |
|---|---|---|
| `clob_place_order` | `dexalot clob place-order` | `addOrder` |
| `clob_place_order_list` | `dexalot clob place-order-list` | `addOrderList` |
| `clob_cancel_order` | `dexalot clob cancel-order` | `cancelOrder` |
| `clob_cancel_order_by_client_id` | `dexalot clob cancel-order-by-client-id` | `cancelOrderByClientId` |
| `clob_cancel_all_orders` | `dexalot clob cancel-all-orders` | `cancelAllOrders` |
| `clob_cancel_list_orders` | `dexalot clob cancel-list-orders` | `cancelListOrders` |
| `clob_cancel_list_orders_by_client_id` | `dexalot clob cancel-list-orders-by-client-id` | `cancelListOrdersByClientId` |
| `clob_replace_order` | `dexalot clob replace-order` | `replaceOrder` |
| `clob_cancel_add_list` | `dexalot clob cancel-add-list` | `cancelAddList` |

**Notes:**
- Every write accepts `--waitForReceipt true|false` (default true — block until on-chain confirmation).
- `--read-only` drops all 9 write tools from the registered set.
- See [skills/dexalot-clob/SKILL.md](../../skills/dexalot-clob/SKILL.md) for workflows.
