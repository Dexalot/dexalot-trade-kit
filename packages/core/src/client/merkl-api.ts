/**
 * Standalone helper for the external Merkl API. Currently used by only one
 * tool (`rewards.get_stake_merkl_rewards`). DexalotRestClient also exposes
 * `merklGet` if cross-tool reuse is needed; keep this module if the
 * surface ever grows (custom error mapping, alternative hosts, retries).
 */
export const MERKL_BASE_URL = "https://api.merkl.xyz/v4";

export interface MerklRewardsParams {
  address: string;
  chainId: number;
  isTestnet?: boolean;
}

export function buildMerklRewardsPath(p: MerklRewardsParams): string {
  const params = new URLSearchParams();
  params.set("chainId", String(p.chainId));
  params.set("reloadChainId", String(p.chainId));
  if (p.isTestnet) params.set("test", "true");
  return `users/${p.address}/rewards?${params.toString()}`;
}
