import {
  asRecord,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { signedRateLimit } from "./common.js";
import { ConfigError } from "../utils/errors.js";
import type { ToolSpec } from "./types.js";

/**
 * Portfolio module: wallet balances on the Dexalot L1, on connected
 * chains, USD prices, and balance proofs.
 *
 * Routing:
 *   - Dexalot L1 / chain balances → SDK contract reads (via DexalotContractClient)
 *   - USD prices, price histories → SDK (getTokenUsdPrices,
 *     getTokenPriceHistory, getTokenHourlyPriceHistory)
 *   - balance proof → SIGNED_API (REST, requires x-signature header)
 */

const TOKEN_PROP = {
  type: "string" as const,
  description: 'Token symbol (canonical Dexalot L1 symbol, e.g. "ALOT", "USDC", "AVAX").',
};

const ADDRESS_PROP = {
  type: "string" as const,
  description: "Optional 0x-prefixed EVM address to query. Defaults to the wallet's own address.",
};

const CHAIN_PROP = {
  type: "string" as const,
  description: 'Connected chain name (e.g. "Avalanche", "Ethereum", "Arbitrum", "Dexalot L1"). Use market_get_environments to list available chains.',
};

export function registerPortfolioTools(): ToolSpec[] {
  return [
    // ---------------------------------------------------------------------
    // SDK contract reads
    // ---------------------------------------------------------------------
    {
      name: "portfolio_get_balance",
      module: "portfolio",
      description:
        "Read a single token's balance on the Dexalot L1 (total / available / locked). Routes through the Dexalot L1 Portfolio contract via the SDK — requires a wallet because the SDK needs an initialized signer.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          address: ADDRESS_PROP,
        },
        required: ["token"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const token = requireString(args, "token");
        const address = readString(args, "address");
        const result = await sdk.getPortfolioBalance(token, address);
        const data = contract.unwrap(result, "portfolio.getPortfolioBalance");
        return { endpoint: "SDK getPortfolioBalance", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "portfolio_get_all_balances",
      module: "portfolio",
      description:
        "Read every Dexalot L1 balance for an address as { token: { total, available, locked } }. Iterates over the known Portfolio tokens — faster than calling get_balance per token.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          address: ADDRESS_PROP,
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const address = readString(args, "address");
        const result = await sdk.getAllPortfolioBalances(address);
        const rawData = contract.unwrap(result, "portfolio.getAllPortfolioBalances") as Record<string, unknown>;
        // The SDK walks pages of the on-chain Portfolio contract; sparse slots
        // decode to an empty-string symbol key. Filter those out — they are
        // not real tokens.
        const data = Object.fromEntries(
          Object.entries(rawData).filter(([symbol]) => symbol.length > 0),
        );
        return { endpoint: "SDK getAllPortfolioBalances", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "portfolio_get_chain_balance",
      module: "portfolio",
      description:
        "Read a single token's balance on a connected chain (Avalanche, Ethereum, Arbitrum, or Dexalot L1). Native and ERC20 supported. Pre-bridge: use this to confirm funds before deposit. Returns the balance as a string with the chain-native decimals.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          chain: CHAIN_PROP,
          token: TOKEN_PROP,
          address: ADDRESS_PROP,
        },
        required: ["chain", "token"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const chain = requireString(args, "chain");
        const token = requireString(args, "token");
        const address = readString(args, "address");
        const result = await sdk.getChainWalletBalance(chain, token, address);
        const data = contract.unwrap(result, "portfolio.getChainWalletBalance");
        return { endpoint: "SDK getChainWalletBalance", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "portfolio_get_chain_balances",
      module: "portfolio",
      description:
        "Read every recognised token's balance on a single connected chain. Useful before/after bridging to confirm what is held off Dexalot L1. Returns a per-token map keyed by symbol.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          chain: CHAIN_PROP,
          address: ADDRESS_PROP,
        },
        required: ["chain"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const chain = requireString(args, "chain");
        const address = readString(args, "address");
        const result = await sdk.getChainWalletBalances(chain, address);
        const data = contract.unwrap(result, "portfolio.getChainWalletBalances");
        return { endpoint: "SDK getChainWalletBalances", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "portfolio_get_all_chain_balances",
      module: "portfolio",
      description:
        "Read every token balance across every connected chain in one call. Heavy operation — batches per-chain ERC20 + native reads in parallel. Use sparingly; cache the result.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          address: ADDRESS_PROP,
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const address = readString(args, "address");
        const result = await sdk.getAllChainWalletBalances(address);
        const data = contract.unwrap(result, "portfolio.getAllChainWalletBalances");
        return { endpoint: "SDK getAllChainWalletBalances", requestTime: new Date().toISOString(), data };
      },
    },

    // ---------------------------------------------------------------------
    // SDK: USD prices (semi-static cache; SDK forwards parentEnv for cache-
    // key namespacing and parity with the Python SDK)
    // ---------------------------------------------------------------------
    {
      name: "portfolio_get_token_usd_prices",
      module: "portfolio",
      description:
        "Fetch current USD prices for every Dexalot-listed token (Dexalot L1 symbol → USD float). No wallet required. Useful for marking-to-USD a portfolio balance.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      handler: async (_args, { config, contract }) => {
        const sdk = await contract.get();
        const data = contract.unwrap(
          await sdk.getTokenUsdPrices(config.parentEnv),
          "portfolio.getTokenUsdPrices",
        );
        return { endpoint: "SDK getTokenUsdPrices", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "portfolio_get_token_usd_price_history",
      module: "portfolio",
      description:
        "Daily USD price history for one token. Returns an ascending-time PricePoint[] of { timestamp, price }. Optional from/to window (unix seconds) bounds the series. Useful for portfolio performance attribution.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          from: { type: "number", description: "Optional inclusive window start (unix seconds)." },
          to: { type: "number", description: "Optional inclusive window end (unix seconds)." },
        },
        required: ["token"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        const token = requireString(args, "token");
        const opts: { from?: number; to?: number } = {};
        const from = readNumber(args, "from");
        const to = readNumber(args, "to");
        if (from !== undefined) opts.from = from;
        if (to !== undefined) opts.to = to;
        const sdk = await contract.get();
        const data = contract.unwrap(
          await sdk.getTokenPriceHistory(token, Object.keys(opts).length > 0 ? opts : undefined),
          "portfolio.getTokenPriceHistory",
        );
        return { endpoint: "SDK getTokenPriceHistory", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "portfolio_get_token_hourly_usd_price_history",
      module: "portfolio",
      description:
        "Hourly USD price history for one token (more granular than the daily variant). Returns an ascending-time PricePoint[] of { timestamp, price }. Optional from/to window (unix seconds) bounds the series.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          from: { type: "number", description: "Optional inclusive window start (unix seconds)." },
          to: { type: "number", description: "Optional inclusive window end (unix seconds)." },
        },
        required: ["token"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        const token = requireString(args, "token");
        const opts: { from?: number; to?: number } = {};
        const from = readNumber(args, "from");
        const to = readNumber(args, "to");
        if (from !== undefined) opts.from = from;
        if (to !== undefined) opts.to = to;
        const sdk = await contract.get();
        const data = contract.unwrap(
          await sdk.getTokenHourlyPriceHistory(token, Object.keys(opts).length > 0 ? opts : undefined),
          "portfolio.getTokenHourlyPriceHistory",
        );
        return { endpoint: "SDK getTokenHourlyPriceHistory", requestTime: new Date().toISOString(), data };
      },
    },

    // ---------------------------------------------------------------------
    // REST: balance proof via SIGNED_API
    // ---------------------------------------------------------------------
    {
      name: "portfolio_get_balance_proof",
      module: "portfolio",
      description:
        "Fetch a signed Merkle proof attesting a trader's Dexalot L1 balance for one token. Used by off-chain auditors and for compliance reporting. Requires the wallet's x-signature header. Mainnet-only: the endpoint is not deployed on Dexalot testnet/devnet (returns 404).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          traderaddress: {
            type: "string",
            description: "0x-prefixed EVM address whose balance to attest. Defaults to the connected wallet's own address.",
          },
          symbol: {
            ...TOKEN_PROP,
            description: 'Token symbol to attest (e.g. "USDC").',
          },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const symbol = requireString(args, "symbol");
        const traderaddress = readString(args, "traderaddress") ?? client.walletAddress;
        if (!traderaddress) {
          throw new ConfigError(
            "portfolio_get_balance_proof requires a traderaddress or a configured wallet.",
            "Pass --traderaddress or set DEXALOT_PRIVATE_KEY / a profile with private_key.",
          );
        }
        return client.signedGet(
          "balanceproof",
          { traderaddress: traderaddress.toLowerCase(), symbol },
          signedRateLimit("portfolio_get_balance_proof", 2),
        );
      },
    },
  ];
}
