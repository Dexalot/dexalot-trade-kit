import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerPortfolioTools } from "../src/tools/portfolio.js";
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
      walletAddress: "0xWALLET",
      infoGet: async (path: string, query?: Record<string, unknown>) => {
        recorded.push({ method: "infoGet", path, query });
        return { endpoint: `GET info/${path}`, requestTime: "now", data: {} };
      },
      signedGet: async (path: string, query?: Record<string, unknown>) => {
        recorded.push({ method: "signedGet", path, query });
        return { endpoint: `GET signed/${path}`, requestTime: "now", data: {} };
      },
    },
    contract: {
      requireWallet: () => {},
      get: async () => ({
        getPortfolioBalance: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getPortfolioBalance", args });
          return { success: true, data: { total: 1, available: 1, locked: 0 } };
        },
        getAllPortfolioBalances: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getAllPortfolioBalances", args });
          return { success: true, data: {} };
        },
        getChainWalletBalance: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getChainWalletBalance", args });
          return { success: true, data: {} };
        },
        getChainWalletBalances: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getChainWalletBalances", args });
          return { success: true, data: {} };
        },
        getAllChainWalletBalances: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getAllChainWalletBalances", args });
          return { success: true, data: {} };
        },
      }),
      unwrap: (r: { success: boolean; data?: unknown }) => r.data,
    },
  };
}

const BASE_CONFIG: DexalotConfig = {
  hasAuth: true,
  privateKey: "0x" + "1".repeat(64),
  address: "0xWALLET",
  profile: "default",
  baseUrl: "https://api.dexalot.com/api",
  wsUrl: "wss://api.dexalot.com/api/ws",
  parentEnv: "production-multi-avax",
  network: "mainnet",
  timeoutMs: 15000,
  modules: ["portfolio"],
  readOnly: true,
  rpcOverrides: {},
  timestampedAuth: false,
  sourceTag: "TEST",
  verbose: false,
};

describe("portfolio tool registry", () => {
  const tools = registerPortfolioTools();
  it("registers 9 portfolio tools, all reads", () => {
    assert.equal(tools.length, 9);
    for (const t of tools) {
      assert.equal(t.module, "portfolio");
      assert.equal(t.isWrite, false);
    }
  });
});

describe("portfolio REST tools", () => {
  it("get_token_usd_prices hits info/usd-prices", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_usd_prices")!;
    const { recorded, client, contract } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "infoGet");
    assert.equal(recorded[0]!.path, "usd-prices");
  });

  it("get_token_usd_price_history forwards token param", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_usd_price_history")!;
    const { recorded, client, contract } = stub();
    await tool.handler({ token: "ALOT" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "infoGet");
    assert.equal(recorded[0]!.path, "token-usd-price-history");
    assert.deepEqual(recorded[0]!.query, { token: "ALOT" });
  });

  it("get_balance_proof requires symbol", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_balance_proof")!;
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({}, { config: BASE_CONFIG, client, contract }),
      /symbol/i,
    );
  });

  it("get_balance_proof falls back to wallet address when traderaddress omitted", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_balance_proof")!;
    const { recorded, client, contract } = stub();
    await tool.handler({ symbol: "USDC" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "signedGet");
    assert.equal(recorded[0]!.path, "balanceproof");
    assert.deepEqual(recorded[0]!.query, { traderaddress: "0xwallet", symbol: "USDC" });
  });
});

describe("portfolio SDK tools", () => {
  it("get_balance calls sdk.getPortfolioBalance with token + optional address", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_balance")!;
    const { recorded, client, contract } = stub();
    await tool.handler({ token: "USDC" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getPortfolioBalance");
    assert.deepEqual(recorded[0]!.args, ["USDC", undefined]);
  });

  it("get_chain_balance forwards chain + token + address", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_chain_balance")!;
    const { recorded, client, contract } = stub();
    await tool.handler({ chain: "Avalanche", token: "USDC", address: "0xABC" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getChainWalletBalance");
    assert.deepEqual(recorded[0]!.args, ["Avalanche", "USDC", "0xABC"]);
  });
});
