import type { providers } from "ethers";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { bsc } from "viem/chains";
import { myriadBscPublicClient } from "@/lib/myriad/bscPublicClient";

/**
 * After `wallet_switchEthereumChain`, MetaMask / Privy can lag behind `ethers`’ cached network.
 * Poll until the Web3Provider reports the expected chain or time out.
 */
export async function waitForEthersProviderChainId(
  provider: providers.Web3Provider | undefined,
  chainId: number,
  maxWaitMs = 12_000
): Promise<boolean> {
  if (!provider?.getNetwork) return false;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      if (provider.detectNetwork) {
        await provider.detectNetwork();
      }
      const net = await provider.getNetwork();
      if (Number(net.chainId) === chainId) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Static call on BSC with `from` set — surfaces real revert data (balance, slippage, etc.). */
export async function preflightEthCallOnBsc(params: {
  from: Address;
  to: Address;
  data: Hex;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await myriadBscPublicClient.call({
      account: params.from,
      to: params.to,
      data: params.data,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

/**
 * Submit a BSC tx through viem with `chain: bsc` so wallets estimate gas / simulate on 56
 * (ethers Web3Provider can still be stale after switchChain).
 */
export async function sendBscTransactionWithViemWallet(
  ethereumProvider: Parameters<typeof custom>[0],
  from: Address,
  tx: { to: Address; data: Hex; value?: bigint }
): Promise<{ txHash: string }> {
  const wc = createWalletClient({
    account: from,
    chain: bsc,
    transport: custom(ethereumProvider),
  });
  const hash = await wc.sendTransaction({
    to: tx.to,
    data: tx.data,
    value: tx.value ?? BigInt(0),
  });
  const receipt = await myriadBscPublicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });
  return { txHash: receipt.transactionHash };
}
