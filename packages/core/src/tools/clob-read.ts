import {
  asRecord,
  readString,
  readNumber,
  requireString,
} from "./helpers.js";
import { signedRateLimit } from "./common.js";
import type { ToolSpec } from "./types.js";

/**
 * Read-side CLOB tools.
 *
 * Routing (SDK-first):
 *   SDK:  get_open_orders (getOpenOrders), get_order (getOrder by id),
 *         get_order_by_client_id (getOrderByClientId)
 *   REST: get_orders_by_account — full historical order list (any status,
 *         paginated). The SDK only exposes open orders + single-order reads,
 *         so account history has no SDK equivalent and stays on signed REST.
 */

const PAIR_PROP = {
  type: "string" as const,
  description: 'Trading pair (e.g. "ALOT/USDC"). Omit to query across all pairs (where supported).',
};

const ORDER_ID_PROP = {
  type: "string" as const,
  description: "Internal order id (32-byte hex string returned by the contract).",
};

const CLIENT_ORDER_ID_PROP = {
  type: "string" as const,
  description: "Client-side order id (caller-supplied at order placement time).",
};

export function registerClobReadTools(): ToolSpec[] {
  return [
    {
      name: "clob_get_open_orders",
      module: "clob.read",
      description:
        "Fetch the wallet's currently-open CLOB orders, optionally filtered by pair. Returns open + partially-filled orders; canceled/filled orders are not included. Routes through the SDK (getOpenOrders).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          pair: PAIR_PROP,
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const pair = readString(args, "pair");
        const data = contract.unwrap(await sdk.getOpenOrders(pair), "clob.getOpenOrders");
        return { endpoint: "SDK getOpenOrders", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_get_orders_by_account",
      module: "clob.read",
      description:
        "Fetch a paginated list of every order the wallet has ever submitted (any status). Supports filtering by pair, status, and time range. Use this for order history / audit trails.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          pair: PAIR_PROP,
          status: {
            type: "string",
            description: "Filter by order status (OPEN, FILLED, CANCELED, PARTIAL, etc.). Omit for all.",
          },
          limit: { type: "number", description: "Maximum rows to return (default backend limit applies)." },
          offset: { type: "number", description: "Rows to skip (pagination)." },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const params: Record<string, string | number> = {};
        const pair = readString(args, "pair");
        const status = readString(args, "status");
        const limit = readNumber(args, "limit");
        const offset = readNumber(args, "offset");
        if (pair) params.pair = pair;
        if (status) params.status = status;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.signedGet(
          "orders",
          Object.keys(params).length > 0 ? params : undefined,
          signedRateLimit("clob_get_orders_by_account", 5),
        );
      },
    },

    {
      name: "clob_get_order",
      module: "clob.read",
      description:
        "Fetch a single order's current state by internal order id (status, filled quantity, price, fees). Routes through the SDK's on-chain TradePairs read (getOrder).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          orderId: ORDER_ID_PROP,
        },
        required: ["orderId"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const orderId = requireString(args, "orderId");
        const data = contract.unwrap(await sdk.getOrder(orderId), "clob.getOrder");
        return { endpoint: "SDK getOrder", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_get_order_by_client_id",
      module: "clob.read",
      description:
        "Look up an order by its client-supplied id. Routes through the SDK as an on-chain TradePairs contract read (no REST equivalent). Use this when you only kept the clientOrderId after placement.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          clientOrderId: CLIENT_ORDER_ID_PROP,
        },
        required: ["clientOrderId"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const clientOrderId = requireString(args, "clientOrderId");
        const result = await sdk.getOrderByClientId(clientOrderId);
        const data = contract.unwrap(result, "clob.getOrderByClientId");
        return { endpoint: "SDK getOrderByClientId", requestTime: new Date().toISOString(), data };
      },
    },
  ];
}
