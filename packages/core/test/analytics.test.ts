import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerAnalyticsTools } from "../src/tools/analytics.js";
import type { DexalotConfig } from "../src/config.js";

interface Recorded {
  method: "analyticsGet" | "tradePost";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

function stub(returnData: unknown = []): { recorded: Recorded[]; client: any } {
  const recorded: Recorded[] = [];
  return {
    recorded,
    client: {
      analyticsGet: async (path: string, query?: Record<string, unknown>) => {
        recorded.push({ method: "analyticsGet", path, query });
        return { endpoint: `GET stats/${path}`, requestTime: "now", data: returnData };
      },
      tradePost: async (path: string, body?: unknown, _rl?: unknown, query?: Record<string, unknown>) => {
        recorded.push({ method: "tradePost", path, body, query });
        return { endpoint: `POST trading/${path}`, requestTime: "now", data: returnData };
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
  modules: ["analytics"],
  readOnly: true,
  rpcOverrides: {},
  timestampedAuth: false,
  sourceTag: "TEST",
  verbose: false,
};

describe("analytics tool registry", () => {
  const tools = registerAnalyticsTools();

  it("registers 7 analytics tools, all reads", () => {
    assert.equal(tools.length, 7);
    for (const t of tools) {
      assert.equal(t.module, "analytics");
      assert.equal(t.isWrite, false);
    }
  });

  it("all descriptions under 600 chars", () => {
    for (const t of tools) assert.ok(t.description.length < 600);
  });
});

describe("analytics_get_24h_stats", () => {
  const tool = registerAnalyticsTools().find((t) => t.name === "analytics_get_24h_stats")!;
  it("calls /totals/params with the 24h sentinel periodfrom", async () => {
    const { recorded, client } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.equal(recorded[0]!.method, "analyticsGet");
    assert.equal(recorded[0]!.path, "totals/params");
    assert.deepEqual(recorded[0]!.query, { periodfrom: "9999-12-31" });
  });
});

describe("analytics_get_stats", () => {
  const tool = registerAnalyticsTools().find((t) => t.name === "analytics_get_stats")!;
  it("calls /totals/params with no query when no dates given", async () => {
    const { recorded, client } = stub();
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.equal(recorded[0]!.query, undefined);
  });
  it("forwards date params verbatim", async () => {
    const { recorded, client } = stub();
    await tool.handler(
      { periodfrom: "2026-01-01", periodto: "2026-05-25" },
      { config: BASE_CONFIG, client, contract: {} as any },
    );
    assert.deepEqual(recorded[0]!.query, { periodfrom: "2026-01-01", periodto: "2026-05-25" });
  });
});

describe("analytics_get_burned_fee_data", () => {
  const tool = registerAnalyticsTools().find((t) => t.name === "analytics_get_burned_fee_data")!;
  it("rejects missing periodfrom", async () => {
    const { client } = stub();
    await assert.rejects(
      tool.handler({ periodto: "2026-05-25" }, { config: BASE_CONFIG, client, contract: {} as any }),
      /periodfrom/i,
    );
  });
});

describe("analytics_get_apys", () => {
  const tool = registerAnalyticsTools().find((t) => t.name === "analytics_get_apys")!;
  it("posts trader list as body and dateperiod as query", async () => {
    const { recorded, client } = stub();
    await tool.handler(
      { traderaddresses: ["0xabc", "0xdef"], dateperiod: "month" },
      { config: BASE_CONFIG, client, contract: {} as any },
    );
    assert.equal(recorded[0]!.method, "tradePost");
    assert.equal(recorded[0]!.path, "apys");
    assert.deepEqual(recorded[0]!.body, { traderaddresses: ["0xabc", "0xdef"] });
    assert.deepEqual(recorded[0]!.query, { dateperiod: "month" });
  });

  it("rejects empty trader list", async () => {
    const { client } = stub();
    await assert.rejects(
      tool.handler({ traderaddresses: [], dateperiod: "month" }, { config: BASE_CONFIG, client, contract: {} as any }),
      /at least one/i,
    );
  });
});
