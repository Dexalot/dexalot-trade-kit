import { allToolSpecs, MODULES } from "@dexalot/trade-core";
import { outputLine } from "../formatter.js";

/**
 * `dexalot discovery list-tools [--module market]` — print every registered tool.
 * Useful for agents introspecting available capabilities without an MCP host.
 */
export function cmdListTools(filterModule?: string, opts: { json: boolean } = { json: false }): void {
  const tools = allToolSpecs();
  const filtered = filterModule ? tools.filter((t) => t.module === filterModule) : tools;

  if (opts.json) {
    outputLine(JSON.stringify(
      filtered.map((t) => ({
        name: t.name,
        module: t.module,
        isWrite: t.isWrite,
        description: t.description,
      })),
      null,
      2,
    ));
    return;
  }

  if (filtered.length === 0) {
    outputLine(filterModule
      ? `No tools registered for module "${filterModule}".`
      : "No tools registered.");
    outputLine(`Known modules: ${MODULES.join(", ")}`);
    return;
  }

  let currentModule = "";
  for (const t of filtered) {
    if (t.module !== currentModule) {
      currentModule = t.module;
      outputLine(`\n[${currentModule}]`);
    }
    const flag = t.isWrite ? " (write)" : "";
    outputLine(`  ${t.name}${flag}`);
    outputLine(`    ${t.description.slice(0, 120)}${t.description.length > 120 ? "…" : ""}`);
  }
}
