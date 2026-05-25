import {
  asRecord,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { ValidationError } from "../utils/errors.js";
import type { ToolSpec } from "./types.js";

/**
 * Swap (RFQ) module. All four tools route through the SDK because the
 * underlying SWAP_API calls require chain resolution, token normalization,
 * and (for execute) on-chain settlement against the MainnetRFQ contract.
 *
 * Quotes:
 *   - soft (indicative) — uses x-wallet-address only, fast
 *   - firm (committed)  — uses x-signature, time-bounded
 */

const TOKEN_PROP = {
  type: "string" as const,
  description: 'Token symbol (canonical Dexalot subnet symbol, e.g. "ALOT", "USDC").',
};

const CHAIN_PROP = {
  type: "number" as const,
  description: "Chain id (numeric). E.g. 43114 for Avalanche C-Chain mainnet, 43113 for Fuji testnet.",
};

/**
 * Resolve {from, to} into a Dexalot RFQ pair string + direction flags.
 * Mirrors the SDK's `_resolvePair` but doesn't require an initialized SDK
 * (we fetch the pair list once per chain via the existing swap_get_pairs
 * SDK call, which we keep around for caching).
 *
 *  - If `fromToken/toToken` exists in pairs → from is base, side=1 (SELL base)
 *  - If `toToken/fromToken` exists → from is quote, side=0 (BUY base with quote)
 *  - amount is in fromToken units regardless of direction
 *
 * Returns the canonical { pair, side, isbase } the backend expects.
 */
async function resolveSwapPair(
  contract: import("../client/contract-client.js").DexalotContractClient,
  fromToken: string,
  toToken: string,
  chainId: number,
): Promise<{ pair: string; side: 0 | 1; isbase: 0 | 1 }> {
  const sdk = await contract.get();
  const pairsResult = await sdk.getSwapPairs(chainId);
  const pairs = contract.unwrap(pairsResult, "swap.getSwapPairs") as Record<string, unknown>;
  const forward = `${fromToken}/${toToken}`;
  const reverse = `${toToken}/${fromToken}`;
  if (pairs[forward]) {
    return { pair: forward, side: 1, isbase: 1 };
  }
  if (pairs[reverse]) {
    return { pair: reverse, side: 0, isbase: 0 };
  }
  throw new ValidationError(
    `No RFQ pair found for ${fromToken}↔${toToken} on chain ${chainId}. ` +
    `Available pairs: ${Object.keys(pairs).slice(0, 8).join(", ")}…`,
  );
}

/**
 * Fetch an RFQ quote (soft or firm) directly via our REST client so backend
 * error bodies (`{success: false, reasonCode: "FQ-015", reason: "..."}`) are
 * preserved verbatim. The SDK's getSwapQuote swallows the response body and
 * only surfaces "Request failed with status code 400", losing all context.
 */
async function getSwapQuoteViaRest(
  client: import("../client/rest-client.js").DexalotRestClient,
  contract: import("../client/contract-client.js").DexalotContractClient,
  fromToken: string,
  toToken: string,
  amount: number,
  chainId: number,
  firm: boolean,
): Promise<{ endpoint: string; requestTime: string; data: unknown }> {
  const { pair, side, isbase } = await resolveSwapPair(contract, fromToken, toToken, chainId);
  const path = firm ? "firmQuote" : "pairprice";
  const params: Record<string, unknown> = {
    chainid: chainId,
    pair,
    amount: amount.toString(),
    isbase: String(isbase),
    side: String(side),
  };
  if (firm) {
    if (!client.walletAddress) {
      throw new ValidationError("firm quote requires a wallet (no signer available).");
    }
    params.address = client.walletAddress;
  } else {
    // Soft quote uses a sentinel taker (matches SDK behavior).
    params.taker = "0x0000000000000000000000000000000000000000";
  }
  return client.swapGet(path, params);
}

/**
 * Normalize a quote payload into the shape `executeRFQSwap` expects.
 *
 * The backend's firmQuote endpoint returns either:
 *   - `{ success, quote: { signature, order, nonceAndMeta, ... }, chainId? }` (current)
 *   - `{ secureQuote: { signature, data|order }, chainId, ... }` (SDK-canonical)
 *
 * The SDK's `executeRFQSwap` requires `quote.secureQuote.{signature, data|order}`
 * after its internal `_transformQuoteFromAPI`. When the backend returns the
 * flat current shape, lift `signature`+`order` into a synthesized `secureQuote`.
 */
function normalizeQuoteForExecute(input: Record<string, unknown>): Record<string, unknown> {
  // If the caller passed our `swap_get_firm_quote` ToolResult by mistake, unwrap.
  if (input.data && typeof input.data === "object" && !input.success && !input.secureQuote) {
    input = input.data as Record<string, unknown>;
  }
  // Inner-quote unwrap: `{success, quote: {...}}` → just `{...}`.
  const inner = (input.quote && typeof input.quote === "object")
    ? (input.quote as Record<string, unknown>)
    : input;

  if (inner.secureQuote || inner.securequote || inner.secure_quote) {
    return inner;
  }

  if (inner.signature && (inner.order || inner.data)) {
    return {
      ...inner,
      secureQuote: {
        signature: inner.signature,
        order: inner.order,
        data: inner.data,
      },
    };
  }

  return inner;
}

export function registerSwapTools(): ToolSpec[] {
  return [
    {
      name: "swap_get_pairs",
      module: "swap",
      description:
        "List available RFQ swap pairs for a chain. Returns the maker token pairs the Dexalot RFQ contract can settle, plus min/max swap sizes and supported decimals.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          chainIdentifier: {
            description: "Chain id (number) or chain name string ('avalanche', 'fuji', 'arbitrum').",
            oneOf: [{ type: "number" }, { type: "string" }],
          },
        },
        required: ["chainIdentifier"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        const sdk = await contract.get();
        const ci = args.chainIdentifier;
        if (typeof ci !== "number" && typeof ci !== "string") {
          throw new ValidationError("chainIdentifier must be a number or string.");
        }
        const result = await sdk.getSwapPairs(ci);
        const data = contract.unwrap(result, "swap.getSwapPairs");
        return { endpoint: "SDK getSwapPairs", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "swap_get_quote",
      module: "swap",
      description:
        "Get an RFQ swap quote (soft or firm). Soft quotes are indicative; firm quotes are time-bounded maker commitments that can be passed to execute_swap. Hits Dexalot's REST swap-api directly so backend reason codes (FQ-003, FQ-009, FQ-015 etc.) are surfaced verbatim.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          fromToken: { ...TOKEN_PROP, description: "Token you are selling." },
          toToken: { ...TOKEN_PROP, description: "Token you want to receive." },
          amount: { type: "number", description: "Amount of fromToken to swap." },
          firm: { type: "boolean", description: "Request a firm (executable) quote. Default: false (soft/indicative)." },
          chainId: CHAIN_PROP,
        },
        required: ["fromToken", "toToken", "amount"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client, contract }) => {
        const args = asRecord(rawArgs);
        const fromToken = requireString(args, "fromToken");
        const toToken = requireString(args, "toToken");
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const firm = readBoolean(args, "firm") ?? false;
        const chainId = readNumber(args, "chainId");
        if (chainId === undefined) throw new ValidationError("chainId is required (e.g. 43113 for Fuji, 43114 for Avalanche).");
        return getSwapQuoteViaRest(client, contract, fromToken, toToken, amount, chainId, firm);
      },
    },

    {
      name: "swap_get_firm_quote",
      module: "swap",
      description:
        "Get a firm RFQ swap quote (committed price + expiry + signature). Returns a quote object ready to pass to execute_swap. Requires a wallet because the firm-quote endpoint expects an x-signature header. Same backend as swap_get_quote with firm=true.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          fromToken: TOKEN_PROP,
          toToken: TOKEN_PROP,
          amount: { type: "number", description: "Amount of fromToken to swap." },
          chainId: CHAIN_PROP,
        },
        required: ["fromToken", "toToken", "amount"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client, contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const fromToken = requireString(args, "fromToken");
        const toToken = requireString(args, "toToken");
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const chainId = readNumber(args, "chainId");
        if (chainId === undefined) throw new ValidationError("chainId is required.");
        return getSwapQuoteViaRest(client, contract, fromToken, toToken, amount, chainId, true);
      },
    },

    {
      name: "swap_execute",
      module: "swap",
      description:
        "Execute a previously-fetched firm RFQ swap quote on-chain. Pass the entire quote object returned by get_firm_quote (or by get_quote with firm=true). Submits to the MainnetRFQ contract on the quote's chain. Returns txHash on success.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          quote: {
            description: "Full firm quote object as returned by swap_get_firm_quote (price, amount, expiry, signature, …).",
          },
          waitForReceipt: {
            type: "boolean",
            description: "Wait for on-chain receipt before returning. Default: true.",
          },
        },
        required: ["quote"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const rawQuote = args.quote;
        if (!rawQuote || typeof rawQuote !== "object") {
          throw new ValidationError("quote must be the full firm-quote object returned by swap_get_firm_quote.");
        }
        const normalized = normalizeQuoteForExecute(rawQuote as Record<string, unknown>);
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.executeRFQSwap(normalized as any, wait);
        const data = contract.unwrap(result, "swap.executeRFQSwap");
        void readString;
        return { endpoint: "SDK executeRFQSwap", requestTime: new Date().toISOString(), data };
      },
    },
  ];
}
