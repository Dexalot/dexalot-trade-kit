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

  it("registers exactly 8 tools, all in the market module, all reads", () => {
    assert.equal(tools.length, 8);
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

describe("market_get_pairs", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_pairs")!;

  it("calls trade-api /pairs with no query params", async () => {
    const { recorded, client } = stubClient([{ pair: "ALOT/USDC" }]);
    const result = await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]!.path, "pairs");
    assert.equal(recorded[0]!.query, undefined);
    assert.deepEqual((result as any).data, [{ pair: "ALOT/USDC" }]);
  });
});

describe("market_get_environments", () => {
  const tool = registerMarketTools().find((t) => t.name === "market_get_environments")!;

  it("defaults frontend=true", async () => {
    const { recorded, client } = stubClient([]);
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.deepEqual(recorded[0]!.query, { frontend: true });
  });

  it("respects explicit frontend=false", async () => {
    const { recorded, client } = stubClient([]);
    await tool.handler({ frontend: false }, { config: BASE_CONFIG, client, contract: {} as any });
    assert.deepEqual(recorded[0]!.query, { frontend: false });
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
