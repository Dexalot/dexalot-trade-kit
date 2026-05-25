import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCli, positionalsToToolName } from "../src/parser.js";

describe("parseCli", () => {
  it("parses module + action positionals", () => {
    const v = parseCli(["market", "get-pairs"]);
    assert.deepEqual(v.positionals, ["market", "get-pairs"]);
    assert.equal(v.json, false);
    assert.equal(v.readOnly, false);
  });

  it("parses global boolean flags", () => {
    const v = parseCli(["market", "get-pairs", "--testnet", "--read-only", "--json"]);
    assert.equal(v.testnet, true);
    assert.equal(v.readOnly, true);
    assert.equal(v.json, true);
  });

  it("parses global flags with values", () => {
    const v = parseCli(["market", "get-pairs", "--network", "devnet", "--profile", "live"]);
    assert.equal(v.network, "devnet");
    assert.equal(v.profile, "live");
  });

  it("forwards unknown flags as rest with string values", () => {
    const v = parseCli(["market", "get-candles", "--pair", "ALOT/USDC", "--intervalnum", "1"]);
    assert.equal(v.rest.pair, "ALOT/USDC");
    assert.equal(v.rest.intervalnum, "1");
  });

  it("treats boolean rest flags without value as true", () => {
    const v = parseCli(["market", "get-environments", "--frontend"]);
    assert.equal(v.rest.frontend, true);
  });

  it("supports --flag=value syntax", () => {
    const v = parseCli(["market", "get-pairs", "--pair=ALOT/USDC"]);
    assert.equal(v.rest.pair, "ALOT/USDC");
  });
});

describe("positionalsToToolName", () => {
  it("joins with underscores and converts hyphens", () => {
    assert.equal(positionalsToToolName(["market", "get-pairs"]), "market_get_pairs");
    assert.equal(positionalsToToolName(["clob", "place-order"]), "clob_place_order");
  });
});
