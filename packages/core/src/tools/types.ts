import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DexalotRestClient } from "../client/rest-client.js";
import type { DexalotContractClient } from "../client/contract-client.js";
import type { DexalotConfig } from "../config.js";
import type { ModuleId } from "../constants.js";

export type ToolArgs = Record<string, unknown>;

export type JsonSchema = Tool["inputSchema"];
export type OutputSchema = NonNullable<Tool["outputSchema"]>;

export interface ToolContext {
  config: DexalotConfig;
  client: DexalotRestClient;
  /**
   * Lazily-initialized SDK wrapper for on-chain operations. Only construct
   * the SDK client when a tool actually needs it — most read tools never
   * touch the chain and shouldn't pay the deployment-fetching cost.
   */
  contract: DexalotContractClient;
}

export interface ToolSpec {
  name: string;
  module: ModuleId;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: OutputSchema;
  isWrite: boolean;
  handler: (args: ToolArgs, context: ToolContext) => Promise<unknown>;
}

export function toMcpTool(tool: ToolSpec): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: {
      readOnlyHint: !tool.isWrite,
      destructiveHint: tool.isWrite,
      idempotentHint: !tool.isWrite,
      openWorldHint: true,
    },
  };
}
