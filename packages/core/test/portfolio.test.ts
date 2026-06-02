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
        getTokenUsdPrices: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getTokenUsdPrices", args });
          return { success: true, data: { ALOT: 0.04, USDC: 1 } };
        },
        getTokenPriceHistory: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getTokenPriceHistory", args });
          return { success: true, data: [{ timestamp: 1717200000, price: 0.04 }] };
        },
        getTokenHourlyPriceHistory: async (...args: unknown[]) => {
          recorded.push({ method: "sdk.getTokenHourlyPriceHistory", args });
          return { success: true, data: [{ timestamp: 1717200000, price: 0.04 }] };
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

describe("portfolio SDK price tools", () => {
  it("get_token_usd_prices routes through SDK getTokenUsdPrices, forwarding parentEnv", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_usd_prices")!;
    const { recorded, client, contract } = stub();
    const res = await tool.handler({}, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getTokenUsdPrices");
    assert.deepEqual(recorded[0]!.args, ["production-multi-avax"]);
    assert.deepEqual((res as any).data, { ALOT: 0.04, USDC: 1 });
  });

  it("get_token_usd_price_history routes through SDK getTokenPriceHistory with token arg", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_usd_price_history")!;
    const { recorded, client, contract } = stub();
    await tool.handler({ token: "ALOT" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getTokenPriceHistory");
    // signature: (token, opts?) - opts is undefined when no from/to provided
    assert.deepEqual(recorded[0]!.args, ["ALOT", undefined]);
  });

  it("get_token_usd_price_history forwards from/to opts when provided", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_usd_price_history")!;
    const { recorded, client, contract } = stub();
    await tool.handler(
      { token: "ALOT", from: 1717200000, to: 1717286400 },
      { config: BASE_CONFIG, client, contract },
    );
    assert.deepEqual(recorded[0]!.args, ["ALOT", { from: 1717200000, to: 1717286400 }]);
  });

  it("get_token_hourly_usd_price_history routes through SDK getTokenHourlyPriceHistory", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_hourly_usd_price_history")!;
    const { recorded, client, contract } = stub();
    await tool.handler({ token: "ALOT" }, { config: BASE_CONFIG, client, contract });
    assert.equal(recorded[0]!.method, "sdk.getTokenHourlyPriceHistory");
    assert.deepEqual(recorded[0]!.args, ["ALOT", undefined]);
  });

  it("get_token_usd_price_history requires token", async () => {
    const tool = registerPortfolioTools().find((t) => t.name === "portfolio_get_token_usd_price_history")!;
    const { client, contract } = stub();
    await assert.rejects(
      tool.handler({}, { config: BASE_CONFIG, client, contract }),
      /token/i,
    );
  });
});

describe("portfolio REST tools (signed)", () => {
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
