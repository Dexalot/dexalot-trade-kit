export { DexalotRestClient } from "./client/rest-client.js";
export { DexalotContractClient } from "./client/contract-client.js";
export { MERKL_BASE_URL, buildMerklRewardsPath } from "./client/merkl-api.js";
export type { MerklRewardsParams } from "./client/merkl-api.js";

export { buildTools, createToolRunner, allToolSpecs } from "./tools/index.js";
export type { ToolResult, ToolRunner } from "./tools/index.js";
export { toMcpTool } from "./tools/types.js";
export type { ToolSpec, ToolContext, ToolArgs } from "./tools/types.js";

export { loadConfig } from "./config.js";
export type { DexalotConfig, CliOptions } from "./config.js";

export {
  MODULES,
  DEFAULT_MODULES,
  CLOB_SUB_MODULE_IDS,
  CLOB_DEFAULT_SUB_MODULES,
  DEXALOT_API_BASE_URL,
  DEXALOT_NETWORKS,
  DEXALOT_SIGNATURE_MESSAGE,
  NETWORK_IDS,
  MODULE_DESCRIPTIONS,
} from "./constants.js";
export type {
  ModuleId,
  ClobSubModuleId,
  NetworkId,
  DexalotNetwork,
  CliModuleKey,
} from "./constants.js";

export {
  DexalotMcpError,
  DexalotApiError,
  ConfigError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ChainError,
  NetworkError,
  toToolErrorPayload,
  suggestForMessage,
  DEXALOT_ERROR_SUGGESTIONS,
} from "./utils/errors.js";
export type { ErrorType, ToolErrorPayload } from "./utils/errors.js";

export type { RequestResult, RequestConfig, Mountpoint, BinaryResult, BinaryRequestOptions } from "./client/types.js";

export {
  readTomlProfile,
  readFullConfig,
  writeFullConfig,
  configFilePath,
  secretsVaultPath,
  tomlStringify,
} from "./config/toml.js";
export type { DexalotProfile, DexalotTomlConfig, RpcOverrideTable } from "./config/toml.js";

export {
  checkForUpdates,
  fetchLatestVersion,
  isNewerVersion,
  fetchDistTags,
} from "./utils/update-check.js";

export { TradeLogger } from "./utils/logger.js";
export type { LogLevel, LogEntry } from "./utils/logger.js";

export {
  runSetup,
  printSetupUsage,
  getConfigPath,
  SUPPORTED_CLIENTS,
  CLIENT_NAMES,
} from "./setup.js";
export type { ClientId, SetupOptions } from "./setup.js";
