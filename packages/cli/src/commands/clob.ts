import type { ToolRunner } from "@dexalot-trade-kit/core";
import { printResult } from "../formatter.js";
import type { CliValues } from "../parser.js";

async function call(runner: ToolRunner, toolName: string, v: CliValues, transform?: (rest: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  const args = transform ? transform({ ...v.rest }) : { ...v.rest };
  const result = await runner(toolName, args);
  printResult(result, { json: v.json });
}

/**
 * Parse comma-separated list arguments for batch tools (e.g. --orderIds "id1,id2,id3").
 */
function splitList(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return undefined;
}

export async function dispatchClobCommand(action: string, runner: ToolRunner, v: CliValues): Promise<boolean> {
  switch (action) {
    // -- read --
    case "get-open-orders":
    case "open-orders":      await call(runner, "clob_get_open_orders", v); return true;
    case "get-orders-by-account":
    case "orders":
    case "history":          await call(runner, "clob_get_orders_by_account", v); return true;
    case "get-order":        await call(runner, "clob_get_order", v); return true;
    case "get-order-by-client-id":
    case "get-by-client-id": await call(runner, "clob_get_order_by_client_id", v); return true;

    // -- write --
    case "place-order":
    case "place":            await call(runner, "clob_place_order", v); return true;

    case "place-order-list":
    case "place-list":
    case "batch-place":
      await call(runner, "clob_place_order_list", v, (rest) => {
        const orders = rest.orders;
        return { ...rest, orders: typeof orders === "string" ? JSON.parse(orders) : orders };
      });
      return true;

    case "cancel-order":
    case "cancel":           await call(runner, "clob_cancel_order", v); return true;
    case "cancel-order-by-client-id":
    case "cancel-by-client-id": await call(runner, "clob_cancel_order_by_client_id", v); return true;
    case "cancel-all-orders":
    case "cancel-all":       await call(runner, "clob_cancel_all_orders", v); return true;

    case "cancel-list-orders":
    case "cancel-list":
      await call(runner, "clob_cancel_list_orders", v, (rest) => ({ ...rest, orderIds: splitList(rest.orderIds) }));
      return true;
    case "cancel-list-orders-by-client-id":
    case "cancel-list-by-client-id":
      await call(runner, "clob_cancel_list_orders_by_client_id", v, (rest) => ({ ...rest, clientOrderIds: splitList(rest.clientOrderIds) }));
      return true;

    case "replace-order":
    case "replace":          await call(runner, "clob_replace_order", v); return true;

    case "cancel-add-list":
    case "replace-batch":
      await call(runner, "clob_cancel_add_list", v, (rest) => {
        const replacements = rest.replacements;
        return { ...rest, replacements: typeof replacements === "string" ? JSON.parse(replacements) : replacements };
      });
      return true;

    default:
      return false;
  }
}
