/**
 * Dexalot CLI argument parser.
 *
 * Convention (mirrors agent-trade-kit):
 *   dexalot <module> <action> [<positional> ...] [--flag value ...]
 *
 * `<module> <action>` joined by underscore becomes the MCP tool name
 * (e.g. `dexalot market get-pairs` -> `market_get_pairs`).
 * Hyphens in actions are preserved through the join — they're converted to
 * underscores by the dispatcher before the tool-name lookup.
 *
 * `--flag value` -> `{ flag: value }` (string).
 * `--flag` alone -> `{ flag: true }`.
 * `--flag=value` is supported.
 * Numeric strings stay strings — tool helpers coerce when expected.
 */

export interface CliValues {
  positionals: string[];

  // Global flags (shared by every command)
  profile?: string;
  network?: string;
  parentEnv?: string;
  testnet: boolean;
  devnet: boolean;
  live: boolean;
  readOnly: boolean;
  json: boolean;
  env: boolean;
  verbose: boolean;
  noLog: boolean;
  logLevel?: string;
  help: boolean;
  version: boolean;

  /** Per-command flags forwarded to tool handlers. Strings or boolean=true. */
  rest: Record<string, string | boolean>;
}

const GLOBAL_FLAGS = new Set([
  "profile",
  "network",
  "parent-env",
  "testnet",
  "devnet",
  "live",
  "read-only",
  "json",
  "env",
  "verbose",
  "no-log",
  "log-level",
  "help",
  "version",
]);

const BOOLEAN_GLOBALS = new Set([
  "testnet",
  "devnet",
  "live",
  "read-only",
  "json",
  "env",
  "verbose",
  "no-log",
  "help",
  "version",
]);

function splitFlag(arg: string): { name: string; inlineValue?: string } {
  const stripped = arg.slice(2);
  const eq = stripped.indexOf("=");
  if (eq === -1) return { name: stripped };
  return { name: stripped.slice(0, eq), inlineValue: stripped.slice(eq + 1) };
}

export function parseCli(argv: string[]): CliValues {
  const positionals: string[] = [];
  const rest: Record<string, string | boolean> = {};
  const out: Partial<CliValues> = {};

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      i++;
      continue;
    }

    const { name, inlineValue } = splitFlag(arg);
    const next = argv[i + 1];
    const consumesValue =
      inlineValue !== undefined ||
      (!BOOLEAN_GLOBALS.has(name) && next !== undefined && !next.startsWith("--"));
    const value = inlineValue ?? (consumesValue ? next! : undefined);

    if (GLOBAL_FLAGS.has(name)) {
      switch (name) {
        case "profile":     out.profile = value; break;
        case "network":     out.network = value; break;
        case "parent-env":  out.parentEnv = value; break;
        case "testnet":     out.testnet = true; break;
        case "devnet":      out.devnet = true; break;
        case "live":        out.live = true; break;
        case "read-only":   out.readOnly = true; break;
        case "json":        out.json = true; break;
        case "env":         out.env = true; break;
        case "verbose":     out.verbose = true; break;
        case "no-log":      out.noLog = true; break;
        case "log-level":   out.logLevel = value; break;
        case "help":        out.help = true; break;
        case "version":     out.version = true; break;
      }
    } else if (consumesValue) {
      rest[name] = value!;
    } else {
      rest[name] = true;
    }

    i += consumesValue && inlineValue === undefined ? 2 : 1;
  }

  return {
    positionals,
    profile: out.profile,
    network: out.network,
    parentEnv: out.parentEnv,
    testnet: out.testnet ?? false,
    devnet: out.devnet ?? false,
    live: out.live ?? false,
    readOnly: out.readOnly ?? false,
    json: out.json ?? false,
    env: out.env ?? false,
    verbose: out.verbose ?? false,
    noLog: out.noLog ?? false,
    logLevel: out.logLevel,
    help: out.help ?? false,
    version: out.version ?? false,
    rest,
  };
}

/** Convert positional words to the MCP tool name (e.g. ["market","get-pairs"] -> "market_get_pairs"). */
export function positionalsToToolName(positionals: string[]): string {
  return positionals.join("_").replace(/-/g, "_");
}
