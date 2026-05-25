import { EOL } from "node:os";
import type { DexalotConfig } from "@dexalot-trade-kit/core";

/**
 * Stdio sink. Default writes to process.stdout/stderr; swap out in tests.
 */
export interface CliOutput {
  out(message: string): void;
  err(message: string): void;
}

const stdioOutput: CliOutput = {
  out: (message) => process.stdout.write(message),
  err: (message) => process.stderr.write(message),
};

let activeOutput: CliOutput = stdioOutput;

export function setOutput(impl: CliOutput): void {
  activeOutput = impl;
}

export function resetOutput(): void {
  activeOutput = stdioOutput;
}

export function outputLine(message: string): void {
  activeOutput.out(message + EOL);
}

export function errorLine(message: string): void {
  activeOutput.err(message + EOL);
}

/**
 * Active env / profile context. Set once after config load; consumed by
 * printers that need to render `--env`-style wrappers.
 */
let envContext: { network: string; profile: string } | null = null;

export function setEnvContext(config: DexalotConfig | null): void {
  envContext = config ? { network: config.network, profile: config.profile } : null;
}

export function getEnvContext(): { network: string; profile: string } | null {
  return envContext;
}

let jsonEnvEnabled = false;
export function setJsonEnvEnabled(value: boolean): void {
  jsonEnvEnabled = value;
}

/**
 * Render a tool's result. The three modes match agent-trade-kit's:
 *   - default        → pretty-print just the data
 *   - --json         → pretty-print the full ToolResult
 *   - --env / --json --env → wrap { env, profile, data }
 */
export function printResult(
  result: { endpoint: string; requestTime: string; data: unknown },
  opts: { json: boolean },
): void {
  if (jsonEnvEnabled && envContext) {
    const wrapper = {
      env: envContext.network,
      profile: envContext.profile,
      data: opts.json ? result : result.data,
    };
    outputLine(JSON.stringify(wrapper, null, 2));
    return;
  }

  if (opts.json) {
    outputLine(JSON.stringify(result, null, 2));
    return;
  }

  outputLine(JSON.stringify(result.data, null, 2));
}
