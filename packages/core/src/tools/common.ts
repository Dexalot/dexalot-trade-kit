import type { RateLimitConfig } from "../utils/rate-limiter.js";

/**
 * Candle interval strings accepted by Dexalot's /trading/candlechart/params endpoint.
 * Mirrors the SDK's `getCandles` interval set.
 */
export const DEXALOT_CANDLE_INTERVALS = [
  "1m", "5m", "15m", "30m",
  "1h", "4h", "12h",
  "1d", "1w",
] as const;

export type DexalotCandleInterval = (typeof DEXALOT_CANDLE_INTERVALS)[number];

/**
 * Rate-limit factories. Defaults are conservative: 10 req/s for public mountpoints
 * (trade/analytics/info), 5 req/s for signed (more expensive for the backend),
 * 5 req/s for swap (rfq quote endpoints are heavier), 1 req/s for merkl (external).
 */
export function publicRateLimit(key: string, rps = 10): RateLimitConfig {
  return {
    key: `public:${key}`,
    capacity: Math.max(1, rps),
    refillPerSecond: rps,
  };
}

export function signedRateLimit(key: string, rps = 5): RateLimitConfig {
  return {
    key: `signed:${key}`,
    capacity: Math.max(1, rps),
    refillPerSecond: rps,
  };
}

export function swapRateLimit(key: string, rps = 5): RateLimitConfig {
  return {
    key: `swap:${key}`,
    capacity: Math.max(1, rps),
    refillPerSecond: rps,
  };
}

export function merklRateLimit(key: string, rps = 1): RateLimitConfig {
  return {
    key: `merkl:${key}`,
    capacity: Math.max(1, rps),
    refillPerSecond: rps,
  };
}

export const PAGINATION_PROPS = {
  limit: { type: "number" as const, description: "Maximum number of records to return." },
  offset: { type: "number" as const, description: "Number of records to skip (pagination)." },
} as const;

export const TIME_RANGE_PROPS = {
  periodfrom: { type: "string" as const, description: "Start time (ISO 8601 or 'YYYY-MM-DD')" },
  periodto: { type: "string" as const, description: "End time (ISO 8601 or 'YYYY-MM-DD')" },
} as const;
