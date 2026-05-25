export type ErrorType =
  | "ConfigError"
  | "AuthenticationError"
  | "RateLimitError"
  | "ValidationError"
  | "DexalotApiError"
  | "ChainError"
  | "NetworkError"
  | "InternalError";

export interface ToolErrorPayload {
  error: true;
  type: ErrorType;
  code?: string;
  message: string;
  suggestion?: string;
  endpoint?: string;
  traceId?: string;
  timestamp: string;
}

export class DexalotMcpError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string;
  public readonly suggestion?: string;
  public readonly endpoint?: string;
  public readonly traceId?: string;

  public constructor(
    type: ErrorType,
    message: string,
    options?: {
      code?: string;
      suggestion?: string;
      endpoint?: string;
      traceId?: string;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = type;
    this.type = type;
    this.code = options?.code;
    this.suggestion = options?.suggestion;
    this.endpoint = options?.endpoint;
    this.traceId = options?.traceId;
  }
}

export class ConfigError extends DexalotMcpError {
  public constructor(message: string, suggestion?: string) {
    super("ConfigError", message, { suggestion });
  }
}

export class ValidationError extends DexalotMcpError {
  public constructor(message: string, suggestion?: string) {
    super("ValidationError", message, { suggestion });
  }
}

export class RateLimitError extends DexalotMcpError {
  public constructor(
    message: string,
    suggestion?: string,
    endpoint?: string,
    traceId?: string,
  ) {
    super("RateLimitError", message, { suggestion, endpoint, traceId });
  }
}

export class AuthenticationError extends DexalotMcpError {
  public constructor(
    message: string,
    suggestion?: string,
    endpoint?: string,
    traceId?: string,
  ) {
    super("AuthenticationError", message, { suggestion, endpoint, traceId });
  }
}

/**
 * REST API error returned by Dexalot's backend. Carries HTTP status as `code`
 * (Dexalot does not use numeric application-level error codes;
 * we map error message text to suggestions instead).
 */
export class DexalotApiError extends DexalotMcpError {
  public constructor(
    message: string,
    options?: {
      code?: string;
      suggestion?: string;
      endpoint?: string;
      traceId?: string;
      cause?: unknown;
    },
  ) {
    super("DexalotApiError", message, options);
  }
}

/**
 * On-chain / RPC error surfaced from ethers or the SDK's ProviderManager.
 * Distinct from DexalotApiError so agents can tell "backend rejected"
 * from "transaction reverted on-chain."
 */
export class ChainError extends DexalotMcpError {
  public constructor(
    message: string,
    options?: {
      code?: string;
      suggestion?: string;
      endpoint?: string;
      traceId?: string;
      cause?: unknown;
    },
  ) {
    super("ChainError", message, options);
  }
}

export class NetworkError extends DexalotMcpError {
  public constructor(message: string, endpoint?: string, cause?: unknown) {
    super("NetworkError", message, {
      endpoint,
      cause,
      suggestion:
        "Check network connectivity and retry the request in a few seconds.",
    });
  }
}

/**
 * Pattern→suggestion table for Dexalot REST errors. Used by the REST client
 * to enrich a raw error message with actionable guidance. Keep entries
 * narrowly scoped — overly broad matches misroute unrelated failures.
 */
export const DEXALOT_ERROR_SUGGESTIONS: ReadonlyArray<{ pattern: RegExp; suggestion: string }> = [
  {
    pattern: /insufficient\s+(funds|balance)/i,
    suggestion: "Check balances with portfolio_get_balance. If funds are on another chain, use transfer_deposit to bridge to the subnet.",
  },
  {
    pattern: /not\s+whitelisted|kyc/i,
    suggestion: "Your address may not be whitelisted for this operation. Check Dexalot's KYC/region requirements.",
  },
  {
    pattern: /region.*block|geo.*restrict|sanction/i,
    suggestion: "This region is restricted by Dexalot. Verify your network selection (--network) and Dexalot's regional availability.",
  },
  {
    pattern: /pair.*(not\s+found|does\s+not\s+exist|invalid)/i,
    suggestion: "Trading pair not recognized. Call market_get_pairs to list available pairs in canonical form (e.g. ALOT/USDC).",
  },
  {
    pattern: /order.*(not\s+found|does\s+not\s+exist)/i,
    suggestion: "Order id not found. Confirm the order id via clob_get_open_orders or clob_get_orders_by_account.",
  },
  {
    pattern: /quote.*(expired|stale)/i,
    suggestion: "RFQ quote has expired. Refetch with swap_get_firm_quote and execute promptly.",
  },
  {
    pattern: /signature/i,
    suggestion: "Signature header rejected. Restart the MCP server to refresh the cached x-signature header.",
  },
  {
    pattern: /rate.*limit/i,
    suggestion: "Rate limited by Dexalot. Back off and retry after a short delay.",
  },
];

export function suggestForMessage(message: string): string | undefined {
  for (const { pattern, suggestion } of DEXALOT_ERROR_SUGGESTIONS) {
    if (pattern.test(message)) return suggestion;
  }
  return undefined;
}

export function toToolErrorPayload(
  error: unknown,
  fallbackEndpoint?: string,
): ToolErrorPayload {
  if (error instanceof DexalotMcpError) {
    return {
      error: true,
      type: error.type,
      code: error.code,
      message: error.message,
      suggestion: error.suggestion,
      endpoint: error.endpoint ?? fallbackEndpoint,
      traceId: error.traceId,
      timestamp: new Date().toISOString(),
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  return {
    error: true,
    type: "InternalError",
    message,
    suggestion:
      "Unexpected server error. Check tool arguments and retry. If it persists, inspect server logs.",
    endpoint: fallbackEndpoint,
    timestamp: new Date().toISOString(),
  };
}
