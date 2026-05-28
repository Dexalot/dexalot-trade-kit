import { MODULES, allToolSpecs } from "@dexalot/trade-core";
import { errorLine } from "./formatter.js";

/**
 * Friendlier error for typos like `dexalot mraket get-pairs` or
 * `dexalot market get_pairs`. Suggests the closest registered action.
 */
export function unknownSubcommand(positionals: string[]): void {
  const joined = positionals.join(" ");
  errorLine(`Unknown command: "dexalot ${joined}"`);

  const knownNames = allToolSpecs().map((t) => t.name);
  const target = positionals.join("_").replace(/-/g, "_");
  const close = knownNames
    .map((n) => ({ n, d: distance(target, n) }))
    .sort((a, b) => a.d - b.d)
    .filter((x) => x.d <= 3)
    .slice(0, 3)
    .map((x) => x.n.replace(/_/g, " "));

  if (close.length > 0) {
    errorLine(`Did you mean: ${close.map((c) => `\`dexalot ${c.replace(/_/g, " ")}\``).join(", ")}?`);
  }

  errorLine(`\nRun \`dexalot --help\` to see modules: ${MODULES.join(", ")}`);
  process.exitCode = 1;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}
