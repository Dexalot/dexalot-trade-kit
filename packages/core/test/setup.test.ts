import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSetup, getConfigPath } from "../src/setup.js";

/** Run with HOME pointed at a temp dir so getConfigPath() writes there. */
function withTempHome<T>(fn: () => T): T {
  const home = mkdtempSync(join(tmpdir(), "dexsetup-"));
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.HOME;
    else process.env.HOME = saved;
  }
}

function writtenEntry(server: string): Record<string, unknown> {
  const cfgPath = getConfigPath("claude-desktop")!;
  const d = JSON.parse(readFileSync(cfgPath, "utf-8")) as { mcpServers: Record<string, Record<string, unknown>> };
  return d.mcpServers[server]!;
}

test("runSetup attaches env + --read-only + --profile (claude-desktop)", () => {
  withTempHome(() => {
    runSetup({
      client: "claude-desktop",
      profile: "demo",
      modules: "all",
      readOnly: true,
      env: { DEXALOT_KEYSTORE_PASSWORD: "s3cret" },
    });
    const e = writtenEntry("dexalot-trade-mcp-demo");
    assert.ok(e, "entry written");
    assert.deepEqual(e.env, { DEXALOT_KEYSTORE_PASSWORD: "s3cret" });
    const args = e.args as string[];
    assert.ok(args.includes("--read-only"), "has --read-only");
    assert.ok(args.includes("--profile") && args.includes("demo"), "has --profile demo");
    assert.ok(args.includes("--modules") && args.includes("all"), "has --modules all");
  });
});

test("runSetup omits env + read-only when not requested", () => {
  withTempHome(() => {
    runSetup({ client: "claude-desktop", profile: "p", modules: "market" });
    const e = writtenEntry("dexalot-trade-mcp-p");
    assert.equal(e.env, undefined, "no env block");
    const args = e.args as string[];
    assert.ok(!args.includes("--read-only"), "no --read-only");
    assert.ok(args.includes("market"), "modules forwarded");
  });
});

test("runSetup resolves the local build (absolute node + dist path) when present", () => {
  withTempHome(() => {
    // The test process runs from the monorepo, so packages/mcp/dist exists and
    // serverInvocation() should produce an absolute node + index.js command,
    // not the npx form.
    runSetup({ client: "claude-desktop", profile: "x", modules: "all" });
    const e = writtenEntry("dexalot-trade-mcp-x");
    assert.notEqual(e.command, "npx", "uses local node, not npx");
    assert.match((e.args as string[])[0]!, /packages\/mcp\/dist\/index\.js$/, "points at local build");
  });
});
