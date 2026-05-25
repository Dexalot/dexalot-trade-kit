import {
  asRecord,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { signedRateLimit } from "./common.js";
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
 *   - SIGNED_API REST:     get_combined_transfers (history)
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
    // REST: transfer history
    // -----------------------------------------------------------------
    {
      name: "transfer_get_combined_transfers",
      module: "transfer",
      description:
        "Paginated history of every deposit, withdrawal, gas-top-up, and P2P transfer involving the connected wallet. Returns app-formatted Transfer rows. Supports filtering by type and status.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status (PENDING, COMPLETED, FAILED). Omit for all.",
          },
          type: {
            type: "string",
            description: "Filter by transfer kind (DEPOSIT, WITHDRAWAL, GAS, PORTFOLIO_TRANSFER). Omit for all.",
          },
          limit: { type: "number", description: "Maximum rows to return." },
          offset: { type: "number", description: "Rows to skip (pagination)." },
        },
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const params: Record<string, string | number> = {};
        const status = readString(args, "status");
        const type = readString(args, "type");
        const limit = readNumber(args, "limit");
        const offset = readNumber(args, "offset");
        if (status) params.status = status;
        if (type) params.type = type;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.signedGet(
          "transferscombined",
          Object.keys(params).length > 0 ? params : undefined,
          signedRateLimit("transfer_get_combined_transfers", 5),
        );
      },
    },
  ];
}
