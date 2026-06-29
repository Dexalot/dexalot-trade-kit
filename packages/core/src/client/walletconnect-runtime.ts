import type { DexalotConfig } from "../config.js";
import type { NetworkId } from "../constants.js";
import type { DexalotRestClient } from "./rest-client.js";
import type { DexalotContractClient } from "./contract-client.js";
import { WalletConnectManager } from "./walletconnect.js";

/**
 * Every chain the kit may transact on, per network, advertised as optional
 * namespaces so the wallet approves each one it has. On-chain writes are routed
 * to whichever of these the operation runs on — Dexalot L1 (orders, withdraw,
 * portfolio transfers) and the source chain (deposits). They are optional on
 * purpose: the required chain is always Ethereum mainnet (universal), so the
 * auth-signature session still settles on a wallet that has none of these. The
 * wallet must have the chain added for it to land in the session — see
 * {@link WC_WALLET_NETWORKS} for the custom (Dexalot L1) ones to add.
 */
// Static fallback chain sets, sourced from the live Dexalot environments (the
// connect flow ALSO merges the SDK's live per-network chains via
// contract.getKnownCaipChains(), so this is a baseline, not the only source).
const MAINNET_CHAINS = [
  "eip155:432204", // Dexalot L1 (orders, withdraw, transfers)
  "eip155:43114", // Avalanche C-Chain
  "eip155:43419", // Gunzilla
  "eip155:42161", // Arbitrum One
  "eip155:8453", // Base
  "eip155:56", // BNB Smart Chain
  "eip155:143", // Monad
  "eip155:1", // Ethereum
];
const TESTNET_CHAINS = [
  "eip155:432201", // Dexalot L1 testnet (Fuji Subnet)
  "eip155:43113", // Avalanche Fuji
  "eip155:97", // BSC Testnet
  "eip155:421614", // Arbitrum Sepolia
  "eip155:84532", // Base Sepolia
  "eip155:11155111", // Ethereum Sepolia
  "eip155:707071", // CX Chain testnet
];
export const WC_OPTIONAL_CHAINS: Record<NetworkId, string[]> = {
  mainnet: MAINNET_CHAINS,
  testnet: TESTNET_CHAINS,
  devnet: TESTNET_CHAINS, // devnet reuses the Fuji/testnet chain set
};

/** A custom network the user must add to their wallet so WalletConnect can sign on it. */
export interface WcWalletNetwork {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeSymbol: string;
}

/**
 * Networks that wallets do NOT ship with and must be added manually for writes
 * to work — chiefly the Dexalot L1 (a custom Avalanche subnet). Surfaced in the
 * connect flow so the user adds them before pairing; otherwise the wallet can't
 * approve that chain into the session and on-chain writes are rejected client-side.
 */
export const WC_WALLET_NETWORKS: Record<NetworkId, WcWalletNetwork[]> = {
  mainnet: [
    { chainId: 432204, name: "Dexalot L1", rpcUrl: "https://subnets.avax.network/dexalot/mainnet/rpc", nativeSymbol: "ALOT" },
  ],
  testnet: [
    { chainId: 432201, name: "Dexalot L1 Testnet", rpcUrl: "https://subnets.avax.network/dexalot/testnet/rpc", nativeSymbol: "ALOT" },
  ],
  devnet: [
    { chainId: 432201, name: "Dexalot L1 Testnet", rpcUrl: "https://subnets.avax.network/dexalot/testnet/rpc", nativeSymbol: "ALOT" },
  ],
};

/**
 * Push any Dexalot networks the session is missing into the wallet via
 * `wallet_addEthereumChain` (prompts the user once per network). Returns which
 * networks are still missing afterwards — those need the wallet to add them
 * manually + a reconnect. Best-effort: a wallet that rejects or can't add a
 * custom chain leaves it in `stillMissing`.
 */
export async function ensureWalletNetworks(
  config: DexalotConfig,
  manager: WalletConnectManager,
): Promise<{ added: string[]; stillMissing: string[] }> {
  const needed = WC_WALLET_NETWORKS[config.network] ?? [];
  const added: string[] = [];
  for (const net of needed) {
    if (!manager.sessionChains.includes(`eip155:${net.chainId}`)) {
      try {
        await manager.addNetwork(net);
        added.push(net.name);
      } catch {
        // wallet declined or doesn't support adding this chain
      }
    }
  }
  const stillMissing = needed
    .filter((n) => !manager.sessionChains.includes(`eip155:${n.chainId}`))
    .map((n) => `${n.name} (eip155:${n.chainId})`);
  return { added, stillMissing };
}

/** Build a WalletConnect manager configured for the active network/profile. */
export function createWalletConnectManager(config: DexalotConfig): WalletConnectManager {
  return new WalletConnectManager({
    projectId: config.wcProjectId,
    requiredChains: ["eip155:1"],
    optionalChains: WC_OPTIONAL_CHAINS[config.network] ?? [],
  });
}

/**
 * Restore any persisted WalletConnect session and inject its signer into both
 * clients. Returns the connected address, or null if no live session exists
 * (in which case the kit stays in public-read mode until the user pairs).
 *
 * Flips `config.hasAuth`/`config.address` so the capability snapshot reflects
 * the live wallet. Does NOT force the SDK to initialize — the signer is stored
 * and applied on the contract client's next init, keeping public reads cheap.
 */
export async function attachWalletConnectSession(
  config: DexalotConfig,
  manager: WalletConnectManager,
  rest: DexalotRestClient,
  contract: DexalotContractClient,
): Promise<string | null> {
  await manager.init();
  const signer = manager.getSigner();
  const address = manager.address;
  if (!signer || !address) return null;
  rest.setMessageSigner(signer, address);
  await contract.setExternalSigner(signer);
  config.hasAuth = true;
  config.address = address;
  config.walletConnect = true;
  return address;
}
