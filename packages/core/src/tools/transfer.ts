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
 * Transfer module: cross-chain deposits and withdrawals between connected
 * chains and the Dexalot subnet, gas top-up/removal, P2P portfolio transfers,
 * and bridge fee estimates.
 *
 * Routing:
 *   - SDK contract writes: deposit, withdraw, add_gas, remove_gas, transfer_portfolio
 *   - SDK contract reads:  get_deposit_bridge_fee, get_token_details
 *   - SDK signed REST:     get_combined_transfers (getCombinedTransfers — wraps
 *     the same /transferscombined endpoint with canonical Transfer rows and
 *     correct param names)
 */

const TOKEN_PROP = {
  type: "string" as const,
  description: 'Token symbol (canonical Dexalot subnet symbol, e.g. "ALOT", "USDC", "AVAX").',
};

const CHAIN_PROP = {
  type: "string" as const,
  description: 'Connected chain name (e.g. "Avalanche", "Ethereum", "Arbitrum"). Use market_get_environments to list available chains.',
};

const WAIT_PROP = {
  type: "boolean" as const,
  description: "Wait for on-chain receipt before returning. Default: true.",
};

const LAYERZERO_PROP = {
  type: "boolean" as const,
  description: "Use LayerZero as the bridge transport. Default: false (uses Dexalot's native bridge).",
};

export function registerTransferTools(): ToolSpec[] {
  return [
    // -----------------------------------------------------------------
    // SDK writes — on-chain bridge / transfer / gas
    // -----------------------------------------------------------------
    {
      name: "transfer_deposit",
      module: "transfer",
      description:
        "Bridge tokens from a connected source chain (Avalanche/Ethereum/Arbitrum) to the Dexalot subnet. Submits a deposit on the source chain that the Portfolio contract receives and credits to the wallet's subnet balance. Use get_deposit_bridge_fee first to estimate cost.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          amount: { type: "number", description: "Amount to deposit in display-decimal units." },
          sourceChain: CHAIN_PROP,
          useLayerZero: LAYERZERO_PROP,
          waitForReceipt: WAIT_PROP,
        },
        required: ["token", "amount", "sourceChain"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const token = requireString(args, "token");
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const sourceChain = requireString(args, "sourceChain");
        const useLZ = readBoolean(args, "useLayerZero") ?? false;
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.deposit(token, amount, sourceChain, useLZ, wait);
        const data = contract.unwrap(result, "transfer.deposit");
        return { endpoint: "SDK deposit", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "transfer_withdraw",
      module: "transfer",
      description:
        "Bridge tokens from the Dexalot subnet to a connected destination chain. Submits a withdraw against the subnet Portfolio contract; the destination chain credits the wallet asynchronously.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          amount: { type: "number", description: "Amount to withdraw in display-decimal units." },
          destinationChain: CHAIN_PROP,
          useLayerZero: LAYERZERO_PROP,
          waitForReceipt: WAIT_PROP,
        },
        required: ["token", "amount", "destinationChain"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const token = requireString(args, "token");
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const destinationChain = requireString(args, "destinationChain");
        const useLZ = readBoolean(args, "useLayerZero") ?? false;
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.withdraw(token, amount, destinationChain, useLZ, wait);
        const data = contract.unwrap(result, "transfer.withdraw");
        return { endpoint: "SDK withdraw", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "transfer_add_gas",
      module: "transfer",
      description:
        "Withdraw native ALOT from the subnet Portfolio to the wallet (raise gas balance for paying subnet transaction fees). Useful when the wallet's gas runs low.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "ALOT amount to move from portfolio to wallet." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["amount"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.addGas(amount, wait);
        const data = contract.unwrap(result, "transfer.addGas");
        return { endpoint: "SDK addGas", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "transfer_remove_gas",
      module: "transfer",
      description:
        "Deposit native ALOT from the wallet back into the subnet Portfolio (lower gas balance, restore tradable balance). Reverse of add_gas.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "ALOT amount to move from wallet to portfolio." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["amount"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.removeGas(amount, wait);
        const data = contract.unwrap(result, "transfer.removeGas");
        return { endpoint: "SDK removeGas", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "transfer_portfolio",
      module: "transfer",
      description:
        "P2P transfer of subnet portfolio balance to another wallet. Stays inside Dexalot — no bridge involved. The recipient receives the token on their subnet balance immediately.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          amount: { type: "number", description: "Amount to transfer." },
          toAddress: { type: "string", description: "Recipient 0x-prefixed address." },
          waitForReceipt: WAIT_PROP,
        },
        required: ["token", "amount", "toAddress"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const token = requireString(args, "token");
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const toAddress = requireString(args, "toAddress");
        const wait = readBoolean(args, "waitForReceipt") ?? true;
        const result = await sdk.transferPortfolio(token, amount, toAddress, wait);
        const data = contract.unwrap(result, "transfer.transferPortfolio");
        return { endpoint: "SDK transferPortfolio", requestTime: new Date().toISOString(), data };
      },
    },

    // -----------------------------------------------------------------
    // SDK reads
    // -----------------------------------------------------------------
    {
      name: "transfer_get_deposit_bridge_fee",
      module: "transfer",
      description:
        "Estimate the bridge fee for a deposit from a source chain to Dexalot. Returned as a native-asset float (e.g. AVAX or ETH). Call before deposit to budget gas + bridge cost.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
          amount: { type: "number", description: "Amount to bridge." },
          sourceChain: CHAIN_PROP,
        },
        required: ["token", "amount", "sourceChain"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        const token = requireString(args, "token");
        const amount = readNumber(args, "amount");
        if (amount === undefined) throw new ValidationError("amount is required.");
        const sourceChain = requireString(args, "sourceChain");
        const result = await sdk.getDepositBridgeFee(token, amount, sourceChain);
        const data = contract.unwrap(result, "transfer.getDepositBridgeFee");
        return { endpoint: "SDK getDepositBridgeFee", requestTime: new Date().toISOString(), data };
      },
    },

    {
      name: "transfer_get_token_details",
      module: "transfer",
      description:
        "Fetch low-level token details from the SDK: per-chain contract address, decimals, environment kind. Useful before bridging an unfamiliar token.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          token: TOKEN_PROP,
        },
        required: ["token"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        const sdk = await contract.get();
        const token = requireString(args, "token");
        const result = await sdk.getTokenDetails(token);
        const data = contract.unwrap(result, "transfer.getTokenDetails");
        return { endpoint: "SDK getTokenDetails", requestTime: new Date().toISOString(), data };
      },
    },

    // -----------------------------------------------------------------
    // SDK: transfer history (signed under the hood; SDK normalizes the
    // backend's numeric enums to human-readable labels)
    // -----------------------------------------------------------------
    {
      name: "transfer_get_combined_transfers",
      module: "transfer",
      description:
        "Paginated history of every deposit, withdrawal, gas-top-up, P2P portfolio transfer, and bridge recovery involving the connected wallet. Returns canonical Transfer rows with camelCase fields and human-readable actionType/status/bridge labels.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: 'Filter by token symbol (e.g. "USDC"). Omit for all symbols.',
          },
          periodfrom: {
            type: "string",
            description: "Inclusive window start (backend-accepted date string). Omit for no lower bound.",
          },
          periodto: {
            type: "string",
            description: "Inclusive window end. Omit for no upper bound.",
          },
          limit: { type: "number", description: "Maximum rows to return (mapped to SDK itemsperpage)." },
          offset: { type: "number", description: "Page number for pagination (mapped to SDK pageno)." },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { contract }) => {
        const args = asRecord(rawArgs);
        contract.requireWallet();
        const sdk = await contract.get();
        // Map trade-kit's public schema (limit/offset, plus the SDK's native
        // symbol/periodfrom/periodto) onto the SDK's opts shape. The legacy
        // schema also accepted `status` and `type` filters, but the backend
        // never honored them on this endpoint — the SDK signature reflects
        // that reality, so any incoming status/type are silently dropped
        // here for backward compatibility with existing callers.
        const opts: { symbol?: string; periodfrom?: string; periodto?: string; itemsperpage?: number; pageno?: number } = {};
        const symbol = readString(args, "symbol");
        const periodfrom = readString(args, "periodfrom");
        const periodto = readString(args, "periodto");
        const limit = readNumber(args, "limit");
        const offset = readNumber(args, "offset");
        if (symbol) opts.symbol = symbol;
        if (periodfrom) opts.periodfrom = periodfrom;
        if (periodto) opts.periodto = periodto;
        if (limit !== undefined) opts.itemsperpage = limit;
        if (offset !== undefined) opts.pageno = offset;
        const data = contract.unwrap(
          await sdk.getCombinedTransfers(Object.keys(opts).length > 0 ? opts : undefined),
          "transfer.getCombinedTransfers",
        );
        return { endpoint: "SDK getCombinedTransfers", requestTime: new Date().toISOString(), data };
      },
    },
  ];
}
