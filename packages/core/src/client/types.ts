import type { RateLimitConfig } from "../utils/rate-limiter.js";

export type HttpMethod = "GET" | "POST";

/**
 * REST mountpoints under the Dexalot API host. These mirror the frontend's
 * axios instances exactly (`src/api/apis.ts`).
 *
 *   trade      -> ${baseUrl}/trading/        (public)
 *   signed     -> ${baseUrl}/trading/signed/ (x-signature: <addr>:<sig>)
 *   swap       -> ${baseUrl}/rfq/            (conditional signing per path)
 *   analytics  -> ${baseUrl}/stats/          (public)
 *   info       -> ${baseUrl}/info/           (public)
 *   merkl      -> https://api.merkl.xyz/v4/  (external, no auth)
 */
export type Mountpoint =
  | "trade"
  | "signed"
  | "swap"
  | "analytics"
  | "info"
  | "merkl";

export type QueryValue = unknown;
export type QueryParams = Record<string, QueryValue>;
export type JsonRecord = Record<string, unknown>;

export interface RequestConfig {
  method: HttpMethod;
  /** Path relative to the mountpoint (e.g. "pairs", "orders", "firmQuote"). */
  path: string;
  mountpoint: Mountpoint;
  query?: QueryParams;
  body?: JsonRecord | JsonRecord[];
  rateLimit?: RateLimitConfig;
  extraHeaders?: Record<string, string>;
}

/**
 * Result of a Dexalot REST call. Mirrors agent-trade-kit's shape so tool
 * handlers can keep the same response contract.
 */
export interface RequestResult<TData = unknown> {
  endpoint: string;
  requestTime: string;
  data: TData;
}

/** Options for binary (non-JSON) download requests. */
export interface BinaryRequestOptions {
  /** Maximum response size in bytes. Default: 50 MB. */
  maxBytes?: number;
  /** Expected Content-Type prefix. Default: "application/octet-stream". */
  expectedContentType?: string;
}

/** Result of a binary download request. */
export interface BinaryResult {
  endpoint: string;
  requestTime: string;
  data: Buffer;
  contentType: string;
  contentLength: number;
  traceId?: string;
}
