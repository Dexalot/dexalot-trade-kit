import {
  type DexalotConfig,
  DexalotContractClient,
  createWalletConnectManager,
  ensureWalletNetworks,
  qrToTerminal,
  WC_WALLET_NETWORKS,
} from "@dexalot/trade-core";

/**
 * `dexalot wallet connect|status|disconnect` — manage the WalletConnect session
 * for a `key_source = "walletconnect"` profile (no private key on disk).
 *
 * Returns true if the action was handled. The caller force-exits afterwards
 * because the SignClient holds an open relay websocket that keeps Node alive.
 */
export async function dispatchWalletCommand(action: string, config: DexalotConfig): Promise<boolean> {
  switch (action) {
    case "connect":
      await walletConnect(config);
      return true;
    case "status":
      await walletStatus(config);
      return true;
    case "disconnect":
      await walletDisconnect(config);
      return true;
    default:
      return false;
  }
}

/** Networks the wallet must have added for on-chain writes to be signable over WC. */
function printAddNetworkGuidance(config: DexalotConfig): void {
  const nets = WC_WALLET_NETWORKS[config.network] ?? [];
  if (nets.length === 0) return;
  console.log("Before scanning: add these Dexalot networks to your wallet (wallets don't ship with them) so");
  console.log("WalletConnect can sign on-chain writes — orders, withdraw, transfers run on the Dexalot L1:");
  for (const n of nets) {
    console.log(`  • ${n.name} — chain id ${n.chainId}, RPC ${n.rpcUrl}, symbol ${n.nativeSymbol}`);
  }
  console.log("(Deposits also need the source chain — Avalanche/Fuji etc. — added; most wallets already have those.)\n");
}

/** After pairing, show which chains the session approved and warn about any missing required network. */
function reportCoverage(config: DexalotConfig, sessionChains: string[]): void {
  console.log(`\nSession approved chains: ${sessionChains.join(", ") || "(auth only)"}`);
  const missing = (WC_WALLET_NETWORKS[config.network] ?? [])
    .map((n) => ({ caip: `eip155:${n.chainId}`, name: n.name }))
    .filter((n) => !sessionChains.includes(n.caip));
  if (missing.length > 0) {
    console.log("\n⚠ Your wallet did NOT approve these required Dexalot networks for this session:");
    for (const m of missing) console.log(`  • ${m.name} (${m.caip})`);
    console.log("  Writes on them will be rejected. Add the network(s) in your wallet, then re-run");
    console.log("  `dexalot wallet disconnect` and `dexalot wallet connect`.");
  } else {
    console.log("✓ The Dexalot L1 network is approved — on-chain writes can be signed.");
  }
}

async function walletConnect(config: DexalotConfig): Promise<void> {
  const manager = createWalletConnectManager(config);
  await manager.init();
  if (manager.connected) {
    console.log(`Already connected: ${manager.address}`);
    reportCoverage(config, manager.sessionChains);
    console.log("\nRun `dexalot wallet disconnect` first to pair a different wallet.");
    return;
  }

  printAddNetworkGuidance(config);
  // Request the live, complete chain set for this network (Dexalot L1 + all
  // connected chains) so the wallet can approve every chain it has.
  const extraChains = await new DexalotContractClient(config).getKnownCaipChains();
  const { uri, approval } = await manager.connect(extraChains);
  console.log("Scan this QR code with your wallet (WalletConnect):\n");
  console.log(await qrToTerminal(uri));
  console.log("Or paste this URI into your wallet:\n");
  console.log(`  ${uri}\n`);

  const windowSecs = Number(process.env.DEXALOT_WC_WINDOW) || 180;
  console.log(`Waiting up to ${windowSecs}s for you to approve in your wallet…`);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), windowSecs * 1000));
  const address = await Promise.race([
    approval().catch((err: unknown) => {
      console.error(`Pairing failed: ${(err as Error)?.message ?? String(err)}`);
      return null;
    }),
    timeout,
  ]);

  if (!address) {
    console.error("\nNo approval received. Run `dexalot wallet connect` again to retry.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ Connected: ${address}`);
  console.log("Signed reads, the auth header, and on-chain writes all work now — your wallet prompts for each one.");

  // Push any missing Dexalot networks into the wallet (it prompts to add each).
  const { added } = await ensureWalletNetworks(config, manager);
  if (added.length > 0) console.log(`Added to your wallet: ${added.join(", ")}`);
  reportCoverage(config, manager.sessionChains);
}

async function walletStatus(config: DexalotConfig): Promise<void> {
  const manager = createWalletConnectManager(config);
  await manager.init();
  if (manager.connected) {
    console.log(`Connected: ${manager.address}`);
    reportCoverage(config, manager.sessionChains);
  } else {
    console.log("Not connected. Run `dexalot wallet connect` to pair a wallet.");
  }
}

async function walletDisconnect(config: DexalotConfig): Promise<void> {
  const manager = createWalletConnectManager(config);
  await manager.init();
  if (!manager.connected) {
    console.log("No active WalletConnect session.");
    return;
  }
  const addr = manager.address;
  await manager.disconnect();
  console.log(`✓ Disconnected ${addr}.`);
}
