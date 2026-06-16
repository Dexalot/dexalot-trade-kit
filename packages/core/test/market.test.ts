import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerMarketTools } from "../src/tools/market.js";
import type { DexalotConfig } from "../src/config.js";

interface RecordedCall {
  path: string;
  query: Record<string, unknown> | undefined;
}

function stubClient(returnData: unknown): { recorded: RecordedCall[]; client: any } {
  const recorded: RecordedCall[] = [];
  return {
    recorded,
    client: {
      tradeGet: async (path: string, query?: Record<string, unknown>) => {
        recorded.push({ path, query });
        return { endpoint: `GET ${path}`, requestTime: "2026-05-25T00:00:00.000Z", data: returnData };
      },
    },
  };
}

/**
 * Stub the SDK-backed contract path for SDK-routed market tools
 * (get_pairs, get_tokens, get_environments, get_orderbook, get_candles,
 * get_deployed_contracts).
 */
function stubContract(returnData: unknown): { recorded: string[]; contract: any; sdkArgs: any[] } {
  const recorded: string[] = [];
  const sdkArgs: any[] = [];
  const sdk = {
    getClobPairs: async () => { recorded.push("getClobPairs"); return { success: true, data: returnData }; },
    getTokens: async () => { recorded.push("getTokens"); return { success: true, data: returnData }; },
    getEnvironments: async () => { recorded.push("getEnvironments"); return { success: true, data: returnData }; },
    getOrderBook: async (pair: string) => { recorded.push(`getOrderBook:${pair}`); return { success: true, data: returnData }; },
    getCandles: async (pair: string, interval: string, limit: number) => {
      recorded.push(`getCandles:${pair}:${interval}:${limit}`);
      return { success: true, data: returnData };
    },
    getDeployment: async (opts?: { env?: string; contractType?: string; returnAbi?: boolean }) => {
      recorded.push("getDeployment");
      sdkArgs.push(opts);
      return { success: true, data: returnData };
    },
  };
  return {
    recorded,
    sdkArgs,
    contract: {
      get: async () => sdk,
      unwrap: (r: { success: boolean; data?: unknown }) => r.data,
    },
  };
}

const BASE_CONFIG: DexalotConfig = {
  hasAuth: false,
  profile: "default",
  baseUrl: "https://api.dexalot.com/api",
  wsUrl: "wss://api.dexalot.com/api/ws",
  parentEnv: "production-multi-avax",
  network: "mainnet",
  timeoutMs: 15000,
  modules: ["market"],
  readOnly: true,
  rpcOverrides: {},
  timestampedAuth: false,
  sourceTag: "TEST",
  verbose: false,
};

describe("market tools registry", () => {
  const tools = registerMarketTools();

  it("registers 9 tools, all in the market module, all reads", () => {
    assert.equal(tools.length, 9);
    for (const tool of tools) {
      assert.equal(tool.module, "market");
      assert.equal(tool.isWrite, false, `${tool.name} must be read-only`);
    }
  });

  it("every description is under 600 chars (room to spare under the 900 skill ceiling)", () => {
    for (const tool of tools) {
      assert.ok(tool.description.length > 0, `${tool.name} description missing`);
      assert.ok(tool.description.length < 600, `${tool.name} description too long (${tool.description.length})`);
    }
  });

  it("tool names follow the market_<verb>_<noun> pattern", () => {
    for (const tool of tools) {
      assert.match(tool.name, /^market_[a-z_]+$/);
    }
  });
});

describe("market_get_pairs (SDK)", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_pairs")!;

  it("routes through SDK getClobPairs", async () => {
    const { recorded, contract } = stubContract([{ pair: "ALOT/USDC" }]);
    const result = await tool.handler({}, { config: BASE_CONFIG, client: {} as any, contract });
    assert.deepEqual(recorded, ["getClobPairs"]);
    assert.deepEqual((result as any).data, [{ pair: "ALOT/USDC" }]);
  });
});

describe("market_get_tokens (SDK)", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_tokens")!;

  it("routes through SDK getTokens", async () => {
    const { recorded, contract } = stubContract([{ symbol: "ALOT" }]);
    await tool.handler({}, { config: BASE_CONFIG, client: {} as any, contract });
    assert.deepEqual(recorded, ["getTokens"]);
  });
});

describe("market_get_environments (SDK)", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_environments")!;

  it("routes through SDK getEnvironments", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler({}, { config: BASE_CONFIG, client: {} as any, contract });
    assert.deepEqual(recorded, ["getEnvironments"]);
  });
});

describe("market_get_orderbook (SDK)", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_orderbook")!;

  it("routes through SDK getOrderBook with the pair", async () => {
    const { recorded, contract } = stubContract({ bids: [], asks: [] });
    await tool.handler({ pair: "ALOT/USDC" }, { config: BASE_CONFIG, client: {} as any, contract });
    assert.deepEqual(recorded, ["getOrderBook:ALOT/USDC"]);
  });

  it("rejects missing pair", async () => {
    const { contract } = stubContract({});
    await assert.rejects(
      tool.handler({}, { config: BASE_CONFIG, client: {} as any, contract }),
      /pair/i,
    );
  });
});

describe("market_get_deployed_contracts (SDK)", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_deployed_contracts")!;

  it("falls back to config.parentEnv when env is not provided", async () => {
    const { recorded, sdkArgs, contract } = stubContract([]);
    await tool.handler({}, { config: BASE_CONFIG, client: {} as any, contract });
    assert.deepEqual(recorded, ["getDeployment"]);
    assert.deepEqual(sdkArgs[0], {
      env: "production-multi-avax",
      contractType: "All",
      returnAbi: true,
    });
  });

  it("honours explicit env / contracttype / returnabi (trade-kit schema kept as-is)", async () => {
    const { recorded, sdkArgs, contract } = stubContract([]);
    await tool.handler(
      { env: "fuji-multi-avax", contracttype: "Portfolio", returnabi: false },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    assert.deepEqual(recorded, ["getDeployment"]);
    assert.deepEqual(sdkArgs[0], {
      env: "fuji-multi-avax",
      contractType: "Portfolio",
      returnAbi: false,
    });
  });
});

describe("market_get_candles (SDK)", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_candles")!;

  it("routes through SDK getCandles, translating (intervalnum, intervalstr) -> SDK interval", async () => {
    const { recorded, contract } = stubContract([{ open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }]);
    const result = await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-25T00:00:00Z",
        intervalnum: 1,
        intervalstr: "hours",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 24-hour window at 1h interval -> 24 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:1h:24"]);
    assert.deepEqual((result as any).data, [{ open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }]);
  });

  it("translates (1,'minutes') -> '1m'", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-24T00:10:00Z",
        intervalnum: 1,
        intervalstr: "minutes",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 10-minute window at 1m interval -> 10 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:1m:10"]);
  });

  it("translates (5,'minutes') -> '5m'", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-24T01:00:00Z",
        intervalnum: 5,
        intervalstr: "minutes",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 60-minute window at 5m interval -> 12 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:5m:12"]);
  });

  it("translates (15,'minutes') -> '15m'", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-24T01:00:00Z",
        intervalnum: 15,
        intervalstr: "minutes",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 60-minute window at 15m interval -> 4 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:15m:4"]);
  });

  it("translates (30,'minutes') -> '30m'", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-24T02:00:00Z",
        intervalnum: 30,
        intervalstr: "minutes",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 120-minute window at 30m interval -> 4 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:30m:4"]);
  });

  it("translates (4,'hours') -> '4h'", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-25T00:00:00Z",
        intervalnum: 4,
        intervalstr: "hours",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 24-hour window at 4h interval -> 6 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:4h:6"]);
  });

  it("translates (1,'day') -> '1d'", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24",
        periodto: "2026-05-31",
        intervalnum: 1,
        intervalstr: "day",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 7-day window at 1d interval -> 7 candles
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:1d:7"]);
  });

  it("coerces numeric strings for intervalnum (LLMs may pass '1' instead of 1)", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-25T00:00:00Z",
        intervalnum: "1",
        intervalstr: "hours",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:1h:24"]);
  });

  it("caps the computed limit at the SDK's 500-candle ceiling", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-01T00:00:00Z",
        periodto: "2026-05-31T00:00:00Z",
        intervalnum: 1,
        intervalstr: "minutes",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    // 30 days * 1440 minutes = 43200 -> capped to 500
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:1m:500"]);
  });

  it("ensures limit is at least 1 even for zero/negative ranges", async () => {
    const { recorded, contract } = stubContract([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24T00:00:00Z",
        periodto: "2026-05-24T00:00:00Z",
        intervalnum: 1,
        intervalstr: "hours",
      },
      { config: BASE_CONFIG, client: {} as any, contract },
    );
    assert.deepEqual(recorded, ["getCandles:ALOT/USDC:1h:1"]);
  });

  it("rejects missing required pair", async () => {
    const { contract } = stubContract([]);
    await assert.rejects(
      tool.handler(
        { periodfrom: "2026-05-24", periodto: "2026-05-25", intervalnum: 1, intervalstr: "hours" },
        { config: BASE_CONFIG, client: {} as any, contract },
      ),
      /pair/i,
    );
  });

  it("rejects an unsupported (intervalnum, intervalstr) combination", async () => {
    const { contract } = stubContract([]);
    await assert.rejects(
      tool.handler(
        {
          pair: "ALOT/USDC",
          periodfrom: "2026-05-24",
          periodto: "2026-05-25",
          intervalnum: 7,
          intervalstr: "minutes",
        },
        { config: BASE_CONFIG, client: {} as any, contract },
      ),
      /interval/i,
    );
  });
});

describe("market_get_blacklisted_addresses", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_blacklisted_addresses")!;

  it("calls trade-api /sdnlist", async () => {
    const { recorded, client } = stubClient([]);
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.equal(recorded[0]!.path, "sdnlist");
  });
});
