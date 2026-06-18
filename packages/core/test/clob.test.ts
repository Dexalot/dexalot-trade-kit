import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerClobReadTools } from "../src/tools/clob-read.js";
import { registerClobWriteTools } from "../src/tools/clob-write.js";
import type { DexalotConfig } from "../src/config.js";

interface Recorded {
  method: string;
  path?: string;
  query?: Record<string, unknown>;
  args?: unknown[];
}

function stub(): { recorded: Recorded[]; client: any; contract: any } {
  const recorded: Recorded[] = [];
  return {
    recorded,
    client: {
      signedGet: async (path: string, query?: Record<string, unknown>) => {
        recorded.push({ method: "signedGet", path, query });
        return { endpoint: `GET signed/${path}`, requestTime: "now", data: [] };
      },
    },
    contract: {
      requireWallet: () => {},
      get: async () => ({
        addOrder: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.addOrder", args });
          return { success: true, data: { txHash: "0xtx", clientOrderId: "0xcoid", operation: "addOrder" } };
        },
        addLimitOrderList: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.addLimitOrderList", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        cancelOrder: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.cancelOrder", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        cancelOrderByClientId: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.cancelOrderByClientId", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        cancelAllOrders: async () => {
          recorded.push({ method: "sdk.cancelAllOrders" });
          return { success: true, data: { txHash: "0xtx", cancelledInternalOrderIds: [] } };
        },
        cancelListOrders: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.cancelListOrders", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        cancelListOrdersByClientId: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.cancelListOrdersByClientId", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        replaceOrder: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.replaceOrder", args });
          return { success: true, data: { txHash: "0xtx", clientOrderId: "0xnew" } };
        },
        cancelAddList: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.cancelAddList", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        getOrderByClientId: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getOrderByClientId", args });
          return { success: true, data: { pair: "ALOT/USDC", clientOrderId: args[0] } };
        },
        getOpenOrders: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getOpenOrders", args });
          return { success: true, data: [] };
        },
        getOrder: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getOrder", args });
          return { success: true, data: { id: args[0], status: "NEW" } };
        },
        getOrderHistory: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getOrderHistory", args });
          return { success: true, data: [] };
        },
      }),
      unwrap: (r: { success: boolean; data?: unknown }) => r.data,
    },
  };
}

const BASE_CONFIG: DexalotConfig = {
  hasAuth: true,
  privateKey: "0x" + "2".repeat(64),
  address: "0xWALLET",
  profile: "default",
  baseUrl: "https://api.dexalot.com/api",
  wsUrl: "wss://api.dexalot.com/api/ws",
  parentEnv: "production-multi-avax",
  network: "mainnet",
  timeoutMs: 15000,
  modules: ["clob.read", "clob.write"],
  readOnly: false,
  rpcOverrides: {},
  timestampedAuth: false,
  sourceTag: "TEST",
  verbose: false,
};

describe("clob.read registry", () => {
  const tools = registerClobReadTools();
  it("registers 4 read tools, all under clob.read module", () => {
    assert.equal(tools.length, 4);
    for (const t of tools) {
      assert.equal(t.module, "clob.read");
      assert.equal(t.isWrite, false);
    }
  });
});

describe("clob.write registry", () => {
  const tools = registerClobWriteTools();
  it("registers 9 write tools, all isWrite=true under clob.write module", () => {
    assert.equal(tools.length, 9);
    for (const t of tools) {
      assert.equal(t.module, "clob.write");
      assert.equal(t.isWrite, true, `${t.name} must be isWrite`);
    }
  });
});

describe("clob_get_open_orders (SDK)", () => {
  const tool = registerClobReadTools().find((t) => t.name === "clob_get_open_orders")!;
  it("routes through SDK getOpenOrders with no pair", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getOpenOrders");
    assert.deepEqual(recorded[0]!.args, [undefined]);
  });
  it("forwards pair to getOpenOrders", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({ pair: "ALOT/USDC" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getOpenOrders");
    assert.deepEqual(recorded[0]!.args, ["ALOT/USDC"]);
  });
});

describe("clob_get_orders_by_account (SDK)", () => {
  const tool = registerClobReadTools().find((t) => t.name === "clob_get_orders_by_account")!;

  it("routes through SDK getOrderHistory with no opts when no filters", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getOrderHistory");
    // signature is (account?, opts?); both undefined when no filters
    assert.deepEqual(recorded[0]!.args, [undefined, undefined]);
  });

  it("forwards pair / status / limit / offset to the SDK opts object", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { pair: "ALOT/USDC", status: "FILLED", limit: 50, offset: 100 },
      { config: BASE_CONFIG, client, contract },
    );
    assert.equal(recorded[0]!.method, "sdk.getOrderHistory");
    assert.deepEqual(recorded[0]!.args, [undefined, { pair: "ALOT/USDC", status: "FILLED", limit: 50, offset: 100 }]);
  });

  it("requires a wallet", async () => {
    const { client } = stub();
    const noWalletContract = {
      requireWallet: () => { throw new Error("wallet required"); },
      get: async () => ({}),
      unwrap: (r: any) => r.data,
    };
    await assert.rejects(
      tool.handler({}, { config: BASE_CONFIG, client, contract: noWalletContract }),
      /wallet/i,
    );
  });
});

describe("clob_get_order_by_client_id", () => {
  const tool = registerClobReadTools().find((t) => t.name === "clob_get_order_by_client_id")!;
  it("routes through SDK contract read", async () => {
    const { recorded, client, contract } = stub();
    const res = await tool.handler({ clientOrderId: "0xabc" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getOrderByClientId");
    assert.deepEqual(recorded[0]!.args, ["0xabc"]);
    assert.equal((res as any).data.clientOrderId, "0xabc");
  });
});

describe("clob_place_order", () => {
  const tool = registerClobWriteTools().find((t) => t.name === "clob_place_order")!;
  it("requires LIMIT orders to have a price", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({ pair: "ALOT/USDC", side: "BUY", amount: 100 }, { config: BASE_CONFIG, client, contract }),
      /price is required for LIMIT/i,
    );
  });
  it("allows MARKET orders without price", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { pair: "ALOT/USDC", side: "SELL", amount: 50, type: "MARKET" },
      { config: BASE_CONFIG, client, contract },
    );
    assert.equal(recorded[0]!.method, "sdk.addOrder");
    assert.deepEqual(recorded[0]!.args, [{ pair: "ALOT/USDC", side: "SELL", amount: 50, type: "MARKET" }, true]);
  });
  it("passes waitForReceipt to the SDK", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { pair: "ALOT/USDC", side: "BUY", amount: 100, price: 0.05, waitForReceipt: false },
      { config: BASE_CONFIG, client, contract },
    );
    assert.equal(recorded[0]!.args![1], false);
  });
  it("rejects invalid side", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({ pair: "ALOT/USDC", side: "LONG", amount: 100, price: 1 }, { config: BASE_CONFIG, client, contract }),
      /side must be/i,
    );
  });
  it("forwards timeInForce and stp to the SDK (uppercased)", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { pair: "ALOT/USDC", side: "BUY", amount: 100, price: 0.05, timeInForce: "po", stp: "cancel_maker" },
      { config: BASE_CONFIG, client, contract },
    );
    assert.deepEqual(recorded[0]!.args![0], {
      pair: "ALOT/USDC",
      side: "BUY",
      amount: 100,
      price: 0.05,
      timeInForce: "PO",
      stp: "CANCEL_MAKER",
    });
  });
  it("rejects an unknown timeInForce", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler(
        { pair: "ALOT/USDC", side: "BUY", amount: 100, price: 0.05, timeInForce: "GTX" },
        { config: BASE_CONFIG, client, contract },
      ),
      /timeInForce must be one of/i,
    );
  });
});

describe("clob_place_order_list", () => {
  const tool = registerClobWriteTools().find((t) => t.name === "clob_place_order_list")!;
  it("rejects empty list", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({ orders: [] }, { config: BASE_CONFIG, client, contract }),
      /non-empty/i,
    );
  });
  it("forwards each order to addLimitOrderList", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      {
        orders: [
          { pair: "ALOT/USDC", side: "BUY", amount: 100, price: 0.04 },
          { pair: "ALOT/USDC", side: "BUY", amount: 100, price: 0.03 },
        ],
      },
      { config: BASE_CONFIG, client, contract },
    );
    assert.equal(recorded[0]!.method, "sdk.addLimitOrderList");
    assert.equal((recorded[0]!.args![0] as unknown[]).length, 2);
  });
});

describe("clob_cancel_all_orders", () => {
  const tool = registerClobWriteTools().find((t) => t.name === "clob_cancel_all_orders")!;
  it("takes no arguments", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.cancelAllOrders");
  });
});

describe("clob_cancel_list_orders", () => {
  const tool = registerClobWriteTools().find((t) => t.name === "clob_cancel_list_orders")!;
  it("rejects empty orderIds", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({ orderIds: [] }, { config: BASE_CONFIG, client, contract }),
      /non-empty/i,
    );
  });
});

describe("clob_replace_order", () => {
  const tool = registerClobWriteTools().find((t) => t.name === "clob_replace_order")!;
  it("requires newPrice and newAmount", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({ orderId: "0xabc" }, { config: BASE_CONFIG, client, contract }),
      /newPrice and newAmount/i,
    );
  });
});
