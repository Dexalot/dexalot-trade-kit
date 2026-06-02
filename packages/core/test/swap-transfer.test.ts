import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerSwapTools } from "../src/tools/swap.js";
import { registerTransferTools } from "../src/tools/transfer.js";
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
        getSwapPairs: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getSwapPairs", args });
          return { success: true, data: [] };
        },
        getSwapSoftQuote: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getSwapSoftQuote", args });
          return { success: true, data: { price: 1 } };
        },
        getSwapFirmQuote: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getSwapFirmQuote", args });
          return { success: true, data: { price: 1, signature: "0xsig" } };
        },
        executeRFQSwap: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.executeRFQSwap", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        deposit: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.deposit", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        withdraw: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.withdraw", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        addGas: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.addGas", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        removeGas: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.removeGas", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        transferPortfolio: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.transferPortfolio", args });
          return { success: true, data: { txHash: "0xtx" } };
        },
        getDepositBridgeFee: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getDepositBridgeFee", args });
          return { success: true, data: 0.01 };
        },
        getTokenDetails: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getTokenDetails", args });
          return { success: true, data: { decimals: 6 } };
        },
        getCombinedTransfers: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getCombinedTransfers", args });
          return { success: true, data: [] };
        },
      }),
      unwrap: (r: { success: boolean; data?: unknown }) => r.data,
    },
  };
}

const BASE_CONFIG: DexalotConfig = {
  hasAuth: true,
  privateKey: "0x" + "3".repeat(64),
  address: "0xWALLET",
  profile: "default",
  baseUrl: "https://api.dexalot.com/api",
  wsUrl: "wss://api.dexalot.com/api/ws",
  parentEnv: "production-multi-avax",
  network: "mainnet",
  timeoutMs: 15000,
  modules: ["swap", "transfer"],
  readOnly: false,
  rpcOverrides: {},
  timestampedAuth: false,
  sourceTag: "TEST",
  verbose: false,
};

describe("swap tool registry", () => {
  const tools = registerSwapTools();
  it("registers 4 tools; only execute is isWrite", () => {
    assert.equal(tools.length, 4);
    const writes = tools.filter((t) => t.isWrite).map((t) => t.name);
    assert.deepEqual(writes, ["swap_execute"]);
  });
  it("all under swap module", () => {
    for (const t of tools) assert.equal(t.module, "swap");
  });
});

describe("swap_get_pairs", () => {
  const tool = registerSwapTools().find((t) => t.name === "swap_get_pairs")!;
  it("forwards numeric chainIdentifier", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({ chainIdentifier: 43114 }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getSwapPairs");
    assert.deepEqual(recorded[0]!.args, [43114]);
  });
  it("forwards string chainIdentifier", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({ chainIdentifier: "avalanche" }, { config: BASE_CONFIG, client, contract });
    assert.deepEqual(recorded[0]!.args, ["avalanche"]);
  });
  it("rejects missing chainIdentifier", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({}, { config: BASE_CONFIG, client, contract }),
      /chainIdentifier/i,
    );
  });
});

describe("swap_get_quote", () => {
  const tool = registerSwapTools().find((t) => t.name === "swap_get_quote")!;
  it("routes through getSwapSoftQuote when firm=false (default)", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({ fromToken: "USDC", toToken: "AVAX", amount: 100 }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getSwapSoftQuote");
    assert.deepEqual(recorded[0]!.args, ["USDC", "AVAX", 100, undefined]);
  });
  it("routes through getSwapFirmQuote when firm=true; forwards chainId", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { fromToken: "USDC", toToken: "AVAX", amount: 100, firm: true, chainId: 43114 },
      { config: BASE_CONFIG, client, contract },
    );
    assert.equal(recorded[0]!.method, "sdk.getSwapFirmQuote");
    assert.deepEqual(recorded[0]!.args, ["USDC", "AVAX", 100, 43114]);
  });
});

describe("swap_execute", () => {
  const tool = registerSwapTools().find((t) => t.name === "swap_execute")!;
  it("rejects missing quote", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({}, { config: BASE_CONFIG, client, contract }),
      /quote/i,
    );
  });
  it("forwards the quote object verbatim", async () => {
    const { recorded, client, contract } = stub();
    const quote = { price: 1, signature: "0xsig", expiry: 999 };
    await tool.handler({ quote }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.executeRFQSwap");
    assert.deepEqual(recorded[0]!.args![0], quote);
    assert.equal(recorded[0]!.args![1], true);
  });
});

describe("transfer tool registry", () => {
  const tools = registerTransferTools();
  it("registers 8 tools; 5 writes, 3 reads", () => {
    assert.equal(tools.length, 8);
    const writes = tools.filter((t) => t.isWrite).map((t) => t.name).sort();
    assert.deepEqual(writes, [
      "transfer_add_gas",
      "transfer_deposit",
      "transfer_portfolio",
      "transfer_remove_gas",
      "transfer_withdraw",
    ]);
  });
});

describe("transfer_deposit", () => {
  const tool = registerTransferTools().find((t) => t.name === "transfer_deposit")!;
  it("forwards token + amount + chain + useLayerZero default false + wait default true", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { token: "USDC", amount: 100, sourceChain: "Avalanche" },
      { config: BASE_CONFIG, client, contract },
    );
    assert.equal(recorded[0]!.method, "sdk.deposit");
    assert.deepEqual(recorded[0]!.args, ["USDC", 100, "Avalanche", false, true]);
  });
  it("rejects missing amount", async () => {
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({ token: "USDC", sourceChain: "Avalanche" }, { config: BASE_CONFIG, client, contract }),
      /amount/i,
    );
  });
});

describe("transfer_get_combined_transfers (SDK)", () => {
  const tool = registerTransferTools().find((t) => t.name === "transfer_get_combined_transfers")!;

  it("routes through SDK getCombinedTransfers with no opts when no filters", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getCombinedTransfers");
    assert.deepEqual(recorded[0]!.args, [undefined]);
  });

  it("maps trade-kit limit/offset to SDK itemsperpage/pageno", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler({ limit: 10, offset: 0 }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getCombinedTransfers");
    assert.deepEqual(recorded[0]!.args, [{ itemsperpage: 10, pageno: 0 }]);
  });

  it("forwards symbol + periodfrom + periodto when provided", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { symbol: "USDC", periodfrom: "2026-01-01", periodto: "2026-06-01" },
      { config: BASE_CONFIG, client, contract },
    );
    assert.deepEqual(recorded[0]!.args, [{
      symbol: "USDC",
      periodfrom: "2026-01-01",
      periodto: "2026-06-01",
    }]);
  });

  it("preserves backward-compat status/type by silently dropping them (backend never honored them anyway)", async () => {
    const { recorded, client, contract } = stub();
    await tool.handler(
      { type: "DEPOSIT", status: "COMPLETED", limit: 10 },
      { config: BASE_CONFIG, client, contract },
    );
    // only itemsperpage survives; status/type are dropped at the boundary
    assert.deepEqual(recorded[0]!.args, [{ itemsperpage: 10 }]);
  });
});
