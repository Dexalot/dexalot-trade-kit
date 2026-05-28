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
 * (get_pairs, get_tokens, get_environments, get_orderbook).
 */
function stubContract(returnData: unknown): { recorded: string[]; contract: any } {
  const recorded: string[] = [];
  const sdk = {
    getClobPairs: async () => { recorded.push("getClobPairs"); return { success: true, data: returnData }; },
    getTokens: async () => { recorded.push("getTokens"); return { success: true, data: returnData }; },
    getEnvironments: async () => { recorded.push("getEnvironments"); return { success: true, data: returnData }; },
    getOrderBook: async (pair: string) => { recorded.push(`getOrderBook:${pair}`); return { success: true, data: returnData }; },
  };
  return {
    recorded,
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

describe("market_get_deployed_contracts", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_deployed_contracts")!;

  it("falls back to config.parentEnv when env is not provided", async () => {
    const { recorded, client } = stubClient([]);
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.equal((recorded[0]!.query as any).env, "production-multi-avax");
    assert.equal((recorded[0]!.query as any).contracttype, "All");
    assert.equal((recorded[0]!.query as any).returnabi, true);
  });

  it("honours explicit env / contracttype / returnabi", async () => {
    const { recorded, client } = stubClient([]);
    await tool.handler(
      { env: "fuji-multi-avax", contracttype: "Portfolio", returnabi: false },
      { config: BASE_CONFIG, client, contract: {} as any },
    );
    assert.deepEqual(recorded[0]!.query, {
      env: "fuji-multi-avax",
      contracttype: "Portfolio",
      returnabi: false,
    });
  });
});

describe("market_get_candles", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_candles")!;

  it("forwards all required params verbatim to /candlechart/params", async () => {
    const { recorded, client } = stubClient([]);
    await tool.handler(
      {
        pair: "ALOT/USDC",
        periodfrom: "2026-05-24",
        periodto: "2026-05-25",
        intervalnum: "1",  // string — should coerce
        intervalstr: "hours",
      },
      { config: BASE_CONFIG, client, contract: {} as any },
    );
    assert.equal(recorded[0]!.path, "candlechart/params");
    assert.deepEqual(recorded[0]!.query, {
      pair: "ALOT/USDC",
      periodfrom: "2026-05-24",
      periodto: "2026-05-25",
      intervalnum: 1,
      intervalstr: "hours",
    });
  });

  it("rejects missing required pair", async () => {
    const { client } = stubClient([]);
    await assert.rejects(
      tool.handler(
        { periodfrom: "2026-05-24", periodto: "2026-05-25", intervalnum: 1, intervalstr: "hours" },
        { config: BASE_CONFIG, client, contract: {} as any },
      ),
      /pair/i,
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
