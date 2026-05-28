import { runSetup, printSetupUsage, SUPPORTED_CLIENTS } from "@dexalot/trade-core";
import type { ClientId } from "@dexalot/trade-core";
import { errorLine } from "../formatter.js";

export function handleSetupCommand(argv: string[]): void {
  // argv is everything after `dexalot setup`
  const flags: { client?: string; profile?: string; modules?: string } = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === "--client" && next) { flags.client = next; i += 2; continue; }
    if (arg === "--profile" && next) { flags.profile = next; i += 2; continue; }
    if (arg === "--modules" && next) { flags.modules = next; i += 2; continue; }
    if (arg.startsWith("--client=")) { flags.client = arg.slice("--client=".length); i++; continue; }
    if (arg.startsWith("--profile=")) { flags.profile = arg.slice("--profile=".length); i++; continue; }
    if (arg.startsWith("--modules=")) { flags.modules = arg.slice("--modules=".length); i++; continue; }
    i++;
  }

  if (!flags.client) {
    printSetupUsage();
    return;
  }

  if (!SUPPORTED_CLIENTS.includes(flags.client as ClientId)) {
    errorLine(`Unknown client: "${flags.client}"`);
    errorLine(`Supported: ${SUPPORTED_CLIENTS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  runSetup({
    client: flags.client as ClientId,
    profile: flags.profile,
    modules: flags.modules,
  });
}
