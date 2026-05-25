import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerInfoTools } from "../src/tools/info.js";
import type { DexalotConfig } from "../src/config.js";

interface Recorded {
  method: "tradeGet" | "signedGet";
  path: string;
}

function stub(): { recorded: Recorded[]; client: any } {
  const recorded: Recorded[] = [];
  return {
    recorded,
    client: {
      tradeGet: async (path: string) => {
        recorded.push({ method: "tradeGet", path });
        return { endpoint: `GET trading/${path}`, requestTime: "now", data: [] };
      },
      signedGet: async (path: string) => {
        recorded.push({ method: "signedGet", path });
        return { endpoint: `GET signed/${path}`, requestTime: "now", data: {} };
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
  modules: ["info"],
  readOnly: true,
  rpcOverrides: {},
  timestampedAuth: false,
  sourceTag: "TEST",
  verbose: false,
};

describe("info tool registry", () => {
  const tools = registerInfoTools();

  it("registers 4 info tools, all reads", () => {
    assert.equal(tools.length, 4);
    for (const t of tools) {
      assert.equal(t.module, "info");
      assert.equal(t.isWrite, false);
    }
  });

  it("high-priority announcements hits trading/announcement/0", async () => {
    const { recorded, client } = stub();
    const tool = registerInfoTools().find((t) => t.name === "info_get_high_priority_announcements")!;
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.deepEqual(recorded[0], { method: "tradeGet", path: "announcement/0" });
  });

  it("general announcements hits trading/announcement/4", async () => {
    const { recorded, client } = stub();
    const tool = registerInfoTools().find((t) => t.name === "info_get_announcements")!;
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.deepEqual(recorded[0], { method: "tradeGet", path: "announcement/4" });
  });

  it("rebate tiers hits public trading/volrebatetiers", async () => {
    const { recorded, client } = stub();
    const tool = registerInfoTools().find((t) => t.name === "info_get_volume_rebate_tiers")!;
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.deepEqual(recorded[0], { method: "tradeGet", path: "volrebatetiers" });
  });

  it("account rebate hits signed/tradervolrebate", async () => {
    const { recorded, client } = stub();
    const tool = registerInfoTools().find((t) => t.name === "info_get_account_volume_rebate")!;
    await tool.handler({}, { config: BASE_CONFIG, client, contract: {} as any });
    assert.deepEqual(recorded[0], { method: "signedGet", path: "tradervolrebate" });
  });
});
