import {
  asRecord,
  readBoolean,
  readNumber,
  requireString,
} from "./helpers.js";
import { signedRateLimit, merklRateLimit } from "./common.js";
import { ValidationError } from "../utils/errors.js";
import { buildMerklRewardsPath } from "../client/merkl-api.js";
import type { ToolSpec } from "./types.js";

/**
 * Rewards module: signed-API reward earned + signature endpoints, plus the
 * external Merkl rewards lookup (separate host, no Dexalot auth).
 */
export function registerRewardsTools(): ToolSpec[] {
  return [
    {
      name: "rewards_get_subnet_incentives_info",
      module: "rewards",
      description:
        "Subnet incentives reward info for the connected wallet (type=1). Returns earned + claimable amounts for the active epoch.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet(
          "reward/earned",
          { type: 1 },
          signedRateLimit("rewards_get_subnet_incentives_info", 3),
        ),
    },

    {
      name: "rewards_get_breakdown_claim_info",
      module: "rewards",
      description:
        "Per-period reward breakdown for the connected wallet (no type filter). Drives the claim wizard's pending vs claimed amounts.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet("reward/earned", undefined, signedRateLimit("rewards_get_breakdown_claim_info", 3)),
    },

    {
      name: "rewards_get_subnet_incentives_signature",
      module: "rewards",
      description:
        "Backend signature authorizing the connected wallet's subnet-incentives claim. Pass the signature to the on-chain claim contract.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_args, { client }) =>
        client.signedGet(
          "reward/signature",
          { type: 1 },
          signedRateLimit("rewards_get_subnet_incentives_signature", 2),
        ),
    },

    {
      name: "rewards_get_stake_merkl",
      module: "rewards",
      description:
        "Fetch staking rewards available on Merkl (Angle Protocol's reward aggregator). External host (api.merkl.xyz) — no Dexalot auth required. Pass the wallet address and chain id.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", description: "0x-prefixed wallet address." },
          chainId: { type: "number", description: "Chain id (e.g. 43114 for Avalanche)." },
          isTestnet: { type: "boolean", description: "Append &test=true to query Merkl's testnet endpoint." },
        },
        required: ["address", "chainId"],
        additionalProperties: false,
      },
      handler: async (rawArgs, { client }) => {
        const args = asRecord(rawArgs);
        const address = requireString(args, "address");
        const chainId = readNumber(args, "chainId");
        if (chainId === undefined) throw new ValidationError("chainId is required.");
        const isTestnet = readBoolean(args, "isTestnet");
        const path = buildMerklRewardsPath({ address, chainId, isTestnet });
        return client.merklGet(path, undefined, merklRateLimit("rewards_get_stake_merkl", 1));
      },
    },
  ];
}
