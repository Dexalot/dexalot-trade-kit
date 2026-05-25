import {
  asRecord,
  readString,
  readNumber,
  requireString,
} from "./helpers.js";
import { publicRateLimit, signedRateLimit } from "./common.js";
import { ValidationError } from "../utils/errors.js";
import type { ToolSpec } from "./types.js";

/**
 * OmniVault module: multi-asset vault info, per-account vault holdings,
 * vault assets/transfers, creation config, and the (signed) create-vault
 * contact form.
 *
 * NOTE: `create_vault` is REST-signed POST, not on-chain. It registers
 * the vault creation request with Dexalot's backend (contact info + initial
 * tx hash); the actual vault contract deployment is handled off-band by
 * the Dexalot team.
 */

const VAULT_ID_PROP = {
  type: "number" as const,
  description: "Numeric OmniVault id.",
};

export function registerVaultsTools(): ToolSpec[] {
  return [
    {
      name: "vaults_get_all_vaults",
      module: "vaults",
      description:
        "List every OmniVault on the active Dexalot network. Returns vault id, name, manager address, supported assets, and creation timestamp. Public — no wallet.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.tradeGet("omnivault-info", undefined, publicRateLimit("vaults_get_all_vaults", 5)),
    },

    {
      name: "vaults_get_vaults_by_account",
      module: "vaults",
      description:
        "List OmniVaults owned by / associated with the connected wallet (filtered by the backend based on the x-signature header). Differs from get_all_vaults by scoping to the active account.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet("omnivault-info", undefined, signedRateLimit("vaults_get_vaults_by_account", 3)),
    },

    {
      name: "vaults_get_single_vault_by_account",
      module: "vaults",
      description:
        "Fetch one OmniVault (by id) scoped to the connected account. Returns the account's holdings in the vault if any.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { id: VAULT_ID_PROP },
        required: ["id"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const id = readNumber(args, "id");
        if (id === undefined) throw new ValidationError("id is required.");
        return client.signedGet(
          "omnivault-info",
          { id },
          signedRateLimit("vaults_get_single_vault_by_account", 3),
        );
      },
    },

    {
      name: "vaults_get_vault_assets",
      module: "vaults",
      description:
        "List the assets held by an OmniVault: each asset, its balance, USD value, and proportional weight. Public — no wallet.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { vaultid: VAULT_ID_PROP },
        required: ["vaultid"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const vaultid = readNumber(args, "vaultid");
        if (vaultid === undefined) throw new ValidationError("vaultid is required.");
        return client.tradeGet(
          "omnivault-assets",
          { vaultid },
          publicRateLimit("vaults_get_vault_assets", 5),
        );
      },
    },

    {
      name: "vaults_get_vault_transfers",
      module: "vaults",
      description:
        "List recent transfers (deposits / withdrawals) for an OmniVault from the connected account's perspective. Requires a wallet because it filters by the signed account.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: { vaultid: VAULT_ID_PROP },
        required: ["vaultid"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const vaultid = readNumber(args, "vaultid");
        if (vaultid === undefined) throw new ValidationError("vaultid is required.");
        return client.signedGet(
          "omnivault-transfers",
          { vaultid },
          signedRateLimit("vaults_get_vault_transfers", 3),
        );
      },
    },

    {
      name: "vaults_get_creation_config",
      module: "vaults",
      description:
        "Fetch the OmniVault creation configuration: supported asset lists, required minimums, fee structure. Use before calling create_vault.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.tradeGet("omnivault-creation", undefined, publicRateLimit("vaults_get_creation_config", 2)),
    },

    {
      name: "vaults_create_vault",
      module: "vaults",
      description:
        "Submit an OmniVault creation request to Dexalot. POST to signed REST — not an on-chain transaction. Registers the requested env, initial tx hash, and contact info; Dexalot's team handles the actual vault deployment off-band.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          env: { type: "string", description: "Environment name (e.g. production-multi-avax)." },
          initial_tx: { type: "string", description: "Hash of the initial transaction the requester sent." },
          email: { type: "string", description: "Contact email." },
          tg_id: { type: "string", description: "Telegram id (optional)." },
          x_id: { type: "string", description: "X/Twitter handle (optional)." },
        },
        required: ["env", "initial_tx", "email"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const body = {
          env: requireString(args, "env"),
          initial_tx: requireString(args, "initial_tx"),
          email: requireString(args, "email"),
          tg_id: readString(args, "tg_id"),
          x_id: readString(args, "x_id"),
        };
        return client.signedPost("omnivault-contact", body, signedRateLimit("vaults_create_vault", 1));
      },
    },
  ];
}
