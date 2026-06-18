import { ProxyAgent } from "undici";
import { Wallet } from "ethers";
import {
  ConfigError,
  AuthenticationError,
  DexalotApiError,
  NetworkError,
  RateLimitError,
  suggestForMessage,
} from "../utils/errors.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import { DEXALOT_SIGNATURE_MESSAGE, DEXALOT_NETWORKS } from "../constants.js";
import type { DexalotConfig } from "../config.js";
import type {
  Mountpoint,
  QueryParams,
  QueryValue,
  RequestConfig,
  RequestResult,
} from "./types.js";

const MERKL_BASE_URL = "https://api.merkl.xyz/v4";

const MOUNTPOINT_SUFFIX: Record<Mountpoint, string> = {
  trade: "/trading/",
  signed: "/trading/signed/",
  swap: "/rfq/",
  analytics: "/stats/",
  info: "/info/",
  // merkl is handled specially: it ignores baseUrl and uses MERKL_BASE_URL directly.
  merkl: "/",
};

function isDefined(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function extractTraceId(headers: Headers): string | undefined {
  return (
    headers.get("x-trace-id") ??
    headers.get("x-request-id") ??
    headers.get("traceid") ??
    undefined
  );
}

function stringifyQueryValue(value: QueryValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(",");
  }
  return String(value);
}

function buildQueryString(query?: QueryParams): string {
  if (!query) return "";
  const entries = Object.entries(query).filter(([, value]) => isDefined(value));
  if (entries.length === 0) return "";
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    params.set(key, stringifyQueryValue(value));
  }
  return params.toString();
}

function vlog(message: string): void {
  process.stderr.write(`[verbose] ${message}\n`);
}

/** Stripped path with no leading slash, used for path-conditional auth on the swap mountpoint. */
function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

export class DexalotRestClient {
  private readonly config: DexalotConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly dispatcher?: ProxyAgent;
  private wallet?: Wallet;
  /** Cached `<address>:<signature>` header, signed once and reused. */
  private signatureHeaderPromise?: Promise<string>;

  public constructor(config: DexalotConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(30_000, config.verbose);
    if (config.proxyUrl) {
      this.dispatcher = new ProxyAgent(config.proxyUrl);
    }
    if (config.privateKey) {
      this.wallet = new Wallet(config.privateKey);
      // Surface the address back to the config (set once at startup)
      this.config.address = this.wallet.address;
      // Eagerly sign the static auth message so the x-signature header is ready
      // before the first signed request (a local, gasless signMessage). Awaited
      // lazily by ensureSignatureHeader; the .catch keeps an early failure from
      // becoming an unhandled rejection — it's re-thrown when actually awaited.
      this.signatureHeaderPromise = this.computeSignatureHeader();
      this.signatureHeaderPromise.catch(() => { /* surfaced at ensureSignatureHeader */ });
    }
  }

  private async computeSignatureHeader(): Promise<string> {
    // SDK timestampedAuth flag is currently disabled by default (backend hasn't shipped support).
    // When enabled, sign `${message}${ts}` and additionally send `x-timestamp: <ts>`.
    const signature = await this.wallet!.signMessage(DEXALOT_SIGNATURE_MESSAGE);
    return `${this.wallet!.address}:${signature}`;
  }

  public get baseUrl(): string {
    return this.config.baseUrl;
  }

  public get walletAddress(): string | undefined {
    return this.wallet?.address;
  }

  // ---------------------------------------------------------------------------
  // Convenience helpers (per-mountpoint shortcuts)
  // ---------------------------------------------------------------------------

  public async tradeGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "GET", mountpoint: "trade", path, query, rateLimit });
  }

  public async tradePost<TData = unknown>(
    path: string,
    body?: RequestConfig["body"],
    rateLimit?: RequestConfig["rateLimit"],
    query?: QueryParams,
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "POST", mountpoint: "trade", path, body, query, rateLimit });
  }

  public async signedGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "GET", mountpoint: "signed", path, query, rateLimit });
  }

  public async signedPost<TData = unknown>(
    path: string,
    body?: RequestConfig["body"],
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "POST", mountpoint: "signed", path, body, rateLimit });
  }

  public async swapGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "GET", mountpoint: "swap", path, query, rateLimit });
  }

  public async analyticsGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "GET", mountpoint: "analytics", path, query, rateLimit });
  }

  public async infoGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "GET", mountpoint: "info", path, query, rateLimit });
  }

  public async merklGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({ method: "GET", mountpoint: "merkl", path, query, rateLimit });
  }

  // ---------------------------------------------------------------------------
  // Auth (lazy signature cache)
  // ---------------------------------------------------------------------------

  /**
   * Resolve and cache the `<address>:<signature>` header value.
   * Signs the static message "dexalot" once per process and reuses the result
   * for every subsequent signed call (SIGNED_API and SWAP_API firmQuote).
   *
   * Throws ConfigError if no wallet is configured.
   */
  private async ensureSignatureHeader(): Promise<string> {
    if (!this.wallet) {
      // A locked vault / encrypted profile surfaces its specific guidance here,
      // rather than failing every (public) command at config-load time.
      throw this.config.walletError ?? new ConfigError(
        "Signed Dexalot endpoint requires a wallet, but no private key was loaded.",
        "Set DEXALOT_PRIVATE_KEY or add private_key to your ~/.dexalot/config.toml profile. " +
        "If you only need public data, use --read-only with public modules (market, analytics, info).",
      );
    }
    // Eagerly populated in the constructor when a wallet exists; the ??= covers
    // any path where it wasn't (defensive — re-signs the same static message).
    this.signatureHeaderPromise ??= this.computeSignatureHeader();
    return this.signatureHeaderPromise;
  }

  /**
   * Per-mountpoint header injection. Matches the frontend's interceptor logic
   * in src/api/apis.ts. Path-conditional auth on the swap mountpoint:
   *   - swap + "firmQuote" -> x-signature
   *   - swap + "pairprice" -> x-wallet-address (no signature)
   *   - swap + anything else -> no auth header
   */
  private async applyMountpointAuth(headers: Headers, reqConfig: RequestConfig): Promise<void> {
    const stripped = normalizePath(reqConfig.path);
    switch (reqConfig.mountpoint) {
      case "signed":
        headers.set("x-signature", await this.ensureSignatureHeader());
        return;
      case "swap":
        if (stripped === "firmQuote") {
          headers.set("x-signature", await this.ensureSignatureHeader());
        } else if (stripped === "pairprice") {
          if (this.wallet) headers.set("x-wallet-address", this.wallet.address);
        }
        return;
      case "trade":
      case "analytics":
      case "info":
      case "merkl":
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // Header / URL building
  // ---------------------------------------------------------------------------

  private resolveBaseForMountpoint(mountpoint: Mountpoint): string {
    if (mountpoint === "merkl") return MERKL_BASE_URL;
    return `${this.config.baseUrl}${MOUNTPOINT_SUFFIX[mountpoint]}`.replace(/\/$/, "");
  }

  private buildUrl(reqConfig: RequestConfig): string {
    const base = this.resolveBaseForMountpoint(reqConfig.mountpoint);
    const path = normalizePath(reqConfig.path);
    const query = buildQueryString(reqConfig.query);
    const withPath = path ? `${base}/${path}` : base;
    return query ? `${withPath}?${query}` : withPath;
  }

  private async buildHeaders(reqConfig: RequestConfig): Promise<Headers> {
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    if (this.config.userAgent) headers.set("User-Agent", this.config.userAgent);

    // Dexalot's backend enforces an Origin whitelist (rejects with "Not allowed by CORS"
    // when Origin is missing or unknown). Mirror the frontend's origin per network so
    // our requests look identical to browser requests from the official Dexalot UI.
    if (reqConfig.mountpoint !== "merkl") {
      const webUrl = DEXALOT_NETWORKS[this.config.network]?.webUrl;
      if (webUrl) {
        headers.set("Origin", webUrl);
        headers.set("Referer", `${webUrl}/`);
      }
    }

    await this.applyMountpointAuth(headers, reqConfig);
    if (reqConfig.extraHeaders) {
      for (const [k, v] of Object.entries(reqConfig.extraHeaders)) headers.set(k, v);
    }
    return headers;
  }

  private logRequest(method: string, url: string, mountpoint: Mountpoint): void {
    if (!this.config.verbose) return;
    vlog(`→ ${method} ${url}`);
    vlog(`  mountpoint=${mountpoint} network=${this.config.network} timeout=${this.config.timeoutMs}ms`);
  }

  private logResponse(status: number, rawLen: number, elapsed: number, traceId: string | undefined, note?: string): void {
    if (!this.config.verbose) return;
    const tag = status >= 400 ? "✗" : "←";
    vlog(`${tag} ${status} | ${rawLen}B | ${elapsed}ms | trace=${traceId ?? "-"}${note ? ` | ${note}` : ""}`);
  }

  // ---------------------------------------------------------------------------
  // Response handling
  // ---------------------------------------------------------------------------

  private throwHttpError(status: number, rawText: string, reqConfig: RequestConfig, traceId: string | undefined): never {
    const endpoint = `${reqConfig.method} ${reqConfig.path}`;
    let messagePreview = rawText.slice(0, 240).replace(/\s+/g, " ").trim();
    let parsedMessage: string | undefined;
    let parsedCode: string | undefined;

    try {
      // Dexalot's REST endpoints return one of several JSON error shapes:
      //   - `{ message: "..." }` — generic backend errors
      //   - `{ error: "..." }` — alt shape
      //   - `{ success: false, reason: "...", reasonCode: "FQ-015" }` — RFQ/swap rejections
      //   - `{ code: "...", msg: "..." }` — admin endpoints
      const parsed = JSON.parse(rawText) as {
        message?: string; error?: string; code?: string;
        reason?: string; reasonCode?: string; success?: boolean; msg?: string;
      };
      parsedMessage = parsed.message ?? parsed.error ?? parsed.reason ?? parsed.msg;
      parsedCode = parsed.code ?? parsed.reasonCode;
      if (parsedMessage && parsedCode) {
        // Compose a structured message — agents can grep the code, humans read the text.
        messagePreview = `${parsedCode}: ${parsedMessage}`;
      } else if (parsedMessage) {
        messagePreview = parsedMessage;
      }
    } catch {
      // non-JSON body. If it's an HTML error page, extract the <pre> body
      // (Dexalot's nginx 404 page contains "<pre>Cannot GET /path</pre>"),
      // otherwise fall back to a clean "HTTP <status> on <endpoint>" string.
      if (/<!doctype html|<html/i.test(rawText)) {
        const preMatch = /<pre>([^<]+)<\/pre>/i.exec(rawText);
        messagePreview = preMatch?.[1]?.trim() ?? `HTTP ${status} on ${endpoint}`;
      }
    }

    const code = parsedCode ?? String(status);
    const suggestion = suggestForMessage(messagePreview);

    if (status === 401 || status === 403) {
      throw new AuthenticationError(
        messagePreview || `HTTP ${status} from Dexalot`,
        suggestion ?? "Signature header rejected. Restart to refresh the cached x-signature or verify wallet is whitelisted.",
        endpoint,
        traceId,
      );
    }
    if (status === 429) {
      throw new RateLimitError(
        messagePreview || `HTTP ${status} from Dexalot`,
        suggestion ?? "Rate limited. Back off and retry.",
        endpoint,
        traceId,
      );
    }
    throw new DexalotApiError(messagePreview || `HTTP ${status} from Dexalot`, {
      code,
      endpoint,
      suggestion,
      traceId,
    });
  }

  private processResponse<TData>(
    rawText: string,
    response: Response,
    elapsed: number,
    traceId: string | undefined,
    reqConfig: RequestConfig,
  ): RequestResult<TData> {
    if (!response.ok) {
      this.logResponse(response.status, rawText.length, elapsed, traceId, "error");
      this.throwHttpError(response.status, rawText, reqConfig, traceId);
    }

    this.logResponse(response.status, rawText.length, elapsed, traceId);

    if (!rawText) {
      return {
        endpoint: `${reqConfig.method} ${reqConfig.path}`,
        requestTime: new Date().toISOString(),
        data: null as TData,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (error) {
      throw new NetworkError(
        `Dexalot returned non-JSON response for ${reqConfig.method} ${reqConfig.path}.`,
        `${reqConfig.method} ${reqConfig.path}`,
        error,
      );
    }

    return {
      endpoint: `${reqConfig.method} ${reqConfig.path}`,
      requestTime: new Date().toISOString(),
      data: parsed as TData,
    };
  }

  // ---------------------------------------------------------------------------
  // Core request loop
  // ---------------------------------------------------------------------------

  public async request<TData = unknown>(reqConfig: RequestConfig): Promise<RequestResult<TData>> {
    const url = this.buildUrl(reqConfig);
    const bodyJson = reqConfig.body ? JSON.stringify(reqConfig.body) : "";

    this.logRequest(reqConfig.method, url, reqConfig.mountpoint);

    if (reqConfig.rateLimit) {
      await this.rateLimiter.consume(reqConfig.rateLimit);
    }

    const headers = await this.buildHeaders(reqConfig);
    const t0 = Date.now();
    let response: Response;
    try {
      const fetchOptions: Record<string, unknown> = {
        method: reqConfig.method,
        headers,
        body: reqConfig.method === "POST" ? bodyJson : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
        dispatcher: this.dispatcher,
      };
      response = await fetch(url, fetchOptions as RequestInit);
    } catch (error) {
      if (this.config.verbose) {
        const elapsed = Date.now() - t0;
        const cause = error instanceof Error ? error.message : String(error);
        vlog(`✗ NetworkError after ${elapsed}ms: ${cause}`);
      }
      throw new NetworkError(
        `Failed to call Dexalot endpoint ${reqConfig.method} ${reqConfig.path}.`,
        `${reqConfig.method} ${reqConfig.path}`,
        error,
      );
    }

    const rawText = await response.text();
    const elapsed = Date.now() - t0;
    const traceId = extractTraceId(response.headers);

    return this.processResponse<TData>(rawText, response, elapsed, traceId, reqConfig);
  }
}
