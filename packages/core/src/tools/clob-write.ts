import {
  asRecord,
  readString,
  readNumber,
  readBoolean,
  readStringArray,
  requireString,
} from "./helpers.js";
import { ValidationError } from "../utils/errors.js";
import type { ToolSpec } from "./types.js";

/**
 * Write-side CLOB tools. All operations submit transactions to the TradePairs
 * contract on the Dexalot subnet via the SDK. Every tool is `isWrite: true`
 * and will be dropped from the registered set when --read-only is active.
 *
 * Wait semantics: every write tool accepts an optional `waitForReceipt`
 * boolean. The SDK defaults to true (returns after on-chain confirmation);
 * set false to return as soon as the transaction is broadcast.
 */

const PAIR_PROP = {
  type: "string" as const,
  description: 'Trading pair, e.g. "ALOT/USDC". Must exist in market_get_pairs.',
};

const WAIT_PROP = {
  type: "boolean" as const,
  description: "Wait for on-chain receipt before returning. Default: true.",
};

const ORDER_REQUEST_SCHEMA = {
  type: "object" as const,
  description: "A single order specification.",
  properties: {
    pair: PAIR_PROP,
    side: { type: "string" as const, enum: ["BUY", "SELL"], description: "Order direction." },
    amount: { type: "number" as const, description: "Order quantity in base-token units." },
    price: { type: "number" as const, description: "Limit price in quote-token units. Required for LIMIT, ignored for MARKET." },
    type: { type: "string" as const, enum: ["LIMIT", "MARKET"], description: "Order type. Default: LIMIT." },
  },
  required: ["pair", "side", "amount"],
  additionalProperties: false,
};

function buildOrderRequest(args: Record<string, unknown>): {
  pair: string;
  side: "BUY" | "SELL";
  amount: number;
  price?: number;
  type?: "LIMIT" | "MARKET";
} {
  const pair = requireString(args, "pair");
  const sideRaw = requireString(args, "side").toUpperCase();
  if (sideRaw !== "BUY" && sideRaw !== "SELL") {
    throw new ValidationError(`side must be "BUY" or "SELL" (got "${sideRaw}").`);
  }
  const amount = readNumber(args, "amount");
  if (amount === undefined) throw new ValidationError("amount is required.");
  const price = readNumber(args, "price");
  const typeRaw = readString(args, "type")?.toUpperCase();
  if (typeRaw && typeRaw !== "LIMIT" && typeRaw !== "MARKET") {
    throw new ValidationError(`type must be "LIMIT" or "MARKET" (got "${typeRaw}").`);
  }
  if ((typeRaw ?? "LIMIT") === "LIMIT" && price === undefined) {
    throw new ValidationError("price is required for LIMIT orders.");
  }
  const req: ReturnType<typeof buildOrderRequest> = { pair, side: sideRaw, amount };
  if (price !== undefined) req.price = price;
  if (typeRaw) req.type = typeRaw as "LIMIT" | "MARKET";
  return req;
}

export function registerClobWriteTools(): ToolSpec[] {
  return [
    {
      name: "clob_place_order",
      module: "clob.write",
      description:
        "Place a single CLOB order (LIMIT or MARKET, BUY or SELL). Submits a transaction to the TradePairs contract on the Dexalot subnet. Returns txHash + the auto-generated clientOrderId on success.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          pair: PAIR_PROP,
          side: { type: "string", enum: ["BUY", "SELL"], description: "Order direction." },
          amount: { type: "number", description: "Order quantity in base-token units." },
          price: { type: "number", description: "Limit price (required for LIMIT, ignored for MARKET)." },
          type: { type: "string", enum: ["LIMIT", "MARKET"], description: "Order type. Default: LIMIT." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["pair", "side", "amount"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const req = buildOrderRequest(args);
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.addOrder(req, wait);
        const data = contract.unwrap(result, "clob.addOrder");
        return { endpoint: "SDK addOrder", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_place_order_list",
      module: "clob.write",
      description:
        "Place a batch of orders in a single transaction. All orders must be on the same pair. More gas-efficient than calling place_order N times. Atomic — either all succeed or all revert.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: ORDER_REQUEST_SCHEMA,
            description: "Array of order specifications. All entries must share the same pair.",
          },
          waitForReceipt: WAIT_PROP,
        },
        required: ["orders"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const ordersRaw = args.orders;
        if (!Array.isArray(ordersRaw) || ordersRaw.length === 0) {
          throw new ValidationError("orders must be a non-empty array.");
        }
        const orders = ordersRaw.map((o) => buildOrderRequest(asRecord(o)));
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.addLimitOrderList(orders, wait);
        const data = contract.unwrap(result, "clob.addLimitOrderList");
        return { endpoint: "SDK addLimitOrderList", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_cancel_order",
      module: "clob.write",
      description:
        "Cancel one open order by its internal order id. Returns txHash on success. Idempotent: cancelling an already-filled or already-cancelled order returns an error (use clob_get_open_orders to confirm state first).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Internal order id (32-byte hex)." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["orderId"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const orderId = requireString(args, "orderId");
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.cancelOrder(orderId, wait);
        const data = contract.unwrap(result, "clob.cancelOrder");
        return { endpoint: "SDK cancelOrder", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_cancel_order_by_client_id",
      module: "clob.write",
      description:
        "Cancel one open order by its client-supplied id. Use this when you kept only the clientOrderId after placement. Returns txHash on success.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          clientOrderId: { type: "string", description: "Caller-supplied client order id." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["clientOrderId"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const clientOrderId = requireString(args, "clientOrderId");
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.cancelOrderByClientId(clientOrderId, wait);
        const data = contract.unwrap(result, "clob.cancelOrderByClientId");
        return { endpoint: "SDK cancelOrderByClientId", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_cancel_all_orders",
      module: "clob.write",
      description:
        "Cancel every open order owned by the wallet in a single transaction. Useful for emergency flatten or end-of-day cleanup. Returns the list of cancelled internalOrderIds.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { contract }) => {
        contract.requireWallet();
        const sdk = await contract.get();
        const result = await sdk.cancelAllOrders();
        const data = contract.unwrap(result, "clob.cancelAllOrders");
        return { endpoint: "SDK cancelAllOrders", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_cancel_list_orders",
      module: "clob.write",
      description:
        "Cancel a specific list of orders by internal order id in one transaction. More gas-efficient than cancelling one at a time. Atomic.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orderIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of internal order ids.",
          },
          waitForReceipt: WAIT_PROP,
        },
        required: ["orderIds"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const orderIds = readStringArray(args, "orderIds");
        if (!orderIds || orderIds.length === 0) {
          throw new ValidationError("orderIds must be a non-empty array.");
        }
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.cancelListOrders(orderIds, wait);
        const data = contract.unwrap(result, "clob.cancelListOrders");
        return { endpoint: "SDK cancelListOrders", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_cancel_list_orders_by_client_id",
      module: "clob.write",
      description:
        "Cancel a specific list of orders by client-supplied order id in one transaction. Useful when you only kept the clientOrderIds.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          clientOrderIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of client order ids.",
          },
          waitForReceipt: WAIT_PROP,
        },
        required: ["clientOrderIds"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const clientOrderIds = readStringArray(args, "clientOrderIds");
        if (!clientOrderIds || clientOrderIds.length === 0) {
          throw new ValidationError("clientOrderIds must be a non-empty array.");
        }
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.cancelListOrdersByClientId(clientOrderIds, wait);
        const data = contract.unwrap(result, "clob.cancelListOrdersByClientId");
        return { endpoint: "SDK cancelListOrdersByClientId", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_replace_order",
      module: "clob.write",
      description:
        "Replace an existing open order with a new price and/or amount. Atomic cancel + add in one transaction — cheaper than separate cancel + place. Returns txHash + the new clientOrderId.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Internal id of the order to replace." },
          newPrice: { type: "number", description: "New limit price." },
          newAmount: { type: "number", description: "New order quantity." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["orderId", "newPrice", "newAmount"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const orderId = requireString(args, "orderId");
        const newPrice = readNumber(args, "newPrice");
        const newAmount = readNumber(args, "newAmount");
        if (newPrice === undefined || newAmount === undefined) {
          throw new ValidationError("newPrice and newAmount are required.");
        }
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.replaceOrder(orderId, newPrice, newAmount, wait);
        const data = contract.unwrap(result, "clob.replaceOrder");
        return { endpoint: "SDK replaceOrder", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "clob_cancel_add_list",
      module: "clob.write",
      description:
        "Batch atomic cancel-and-add. Pass an array of { cancelOrderId?, newOrder } replacements. Cancels then places in one transaction — used for order-book re-pricing strategies (move ladders).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          replacements: {
            type: "array",
            description: "Array of replacement specs. Each entry is forwarded verbatim to the SDK; see SDK docs for the exact shape.",
          },
          waitForReceipt: WAIT_PROP,
        },
        required: ["replacements"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const replacementsRaw = args.replacements;
        if (!Array.isArray(replacementsRaw) || replacementsRaw.length === 0) {
          throw new ValidationError("replacements must be a non-empty array.");
        }
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.cancelAddList(replacementsRaw, wait);
        const data = contract.unwrap(result, "clob.cancelAddList");
        return { endpoint: "SDK cancelAddList", requestTime: new Date().toISOString(), data };
      },
    },
  ];
}
