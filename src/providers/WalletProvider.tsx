"use client";

import { useState, useEffect, ReactNode } from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type WalletClient,
} from "viem";
import { providers } from "ethers";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { POLYGON_RPC_URL } from "@/constants/polymarket";
import { polygon, base } from "viem/chains";
import { WalletContext } from "@/contexts/WalletContext";

/** Base chain id – when user is on Base (e.g. Limitless withdraw), do not force Polygon */
const BASE_CHAIN_ID = base.id;

const publicClient = createPublicClient({
  chain: polygon,
  transport: http(POLYGON_RPC_URL),
});

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [ethersSigner, setEthersSigner] =
    useState<providers.JsonRpcSigner | null>(null);

  const { wallets, ready } = useWallets();
  const { authenticated, user } = usePrivy();

  const wallet = wallets.find((w) => w.address === user?.wallet?.address);
  const eoaAddress =
    authenticated && wallet ? (wallet.address as `0x${string}`) : undefined;

  useEffect(() => {
    async function init() {
      if (!wallet || !ready) {
        setWalletClient(null);
        setEthersSigner(null);
        return;
      }

      try {
        const provider = await wallet.getEthereumProvider();

        const client = createWalletClient({
          account: eoaAddress!,
          chain: polygon,
          transport: custom(provider),
        });

        setWalletClient(client);

        const ethersProvider = new providers.Web3Provider(provider);
        setEthersSigner(ethersProvider.getSigner());
      } catch (err) {
        console.error("Failed to initialize wallet client:", err);
        setWalletClient(null);
        setEthersSigner(null);
      }
    }

    init();
  }, [wallet, ready, eoaAddress]);

  useEffect(() => {
    async function ensurePolygonChain() {
      if (!wallet || !ready || !authenticated) return;

      try {
        const chainId = wallet.chainId;
        const isPolygon = chainId === `eip155:${polygon.id}` || chainId === String(polygon.id);
        const isBase = chainId === `eip155:${BASE_CHAIN_ID}` || chainId === String(BASE_CHAIN_ID);
        // Do not switch away from Base (e.g. user is doing Limitless withdraw on Base)
        if (isBase) return;
        if (!isPolygon) {
          await wallet.switchChain(polygon.id);
        }
      } catch (err) {
        console.error("Failed to switch chain:", err);
      }
    }
    ensurePolygonChain();
  }, [wallet, ready, authenticated]);

  return (
    <WalletContext.Provider
      value={{
        eoaAddress,
        walletClient,
        publicClient,
        ethersSigner,
        isReady: ready && authenticated && !!walletClient,
        authenticated,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
