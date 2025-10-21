"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { ReactNode, useEffect } from "react";
import { mainnet, bsc } from "@reown/appkit/networks";

// Create a client
const queryClient = new QueryClient();

// 1. Get projectId from https://cloud.reown.com
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

// 2. Set the networks
const networks = [bsc, mainnet];

// 3. Create a metadata object - optional
const metadata = {
  name: "RaptorX Trade",
  description: "RaptorX Trading Platform - BNB Chain Integration",
  url: "https://www.raptorx.trade", // origin must match your domain & subdomain
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

// 4. Create Ethers adapter
const ethersAdapter = new EthersAdapter();

// 5. Create modal
let modal: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

interface WalletProviderWrapperProps {
  children: ReactNode;
}

export function WalletProviderWrapper({
  children,
}: WalletProviderWrapperProps) {
  useEffect(() => {
    if (!modal && projectId) {
      modal = createAppKit({
        adapters: [ethersAdapter],
        networks: networks as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        metadata,
        projectId,
        features: {
          analytics: true, // Optional - defaults to your Cloud configuration
          email: false, // Disable email authentication
          socials: [], // Remove social login options
          emailShowWallets: false, // Don't show wallets in email flow
        },
        // Show only MetaMask and Trust Wallet
        featuredWalletIds: [
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
        ],
        includeWalletIds: [
          "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
          "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
        ],
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Export modal instance for use in components
export const getWalletModal = () => modal;
