"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { addRpcUrlOverrideToChain } from "@privy-io/chains";
import { polygon } from "viem/chains";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { POLYGON_RPC_URL } from "@/constants/polymarket";
import { ReactNode } from "react";

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const SOLANA_WS_URL = SOLANA_RPC_URL.replace(/^https:/, "wss:").replace(
  /^http:/,
  "ws:",
);

interface PrivyProviderWrapperProps {
  children: ReactNode;
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#676FFF",
          logo: "/images/home-logo.png",
          walletChainType: "ethereum-and-solana",
          walletList: [
            "wallet_connect",
            "detected_wallets",
            "metamask",
            "coinbase_wallet",
            "phantom",
            "solflare",
            "backpack",
            "okx_wallet",
          ],
        },
        loginMethods: ["email", "wallet"],
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true,
          },
        },
        embeddedWallets: {
          showWalletUIs: true,
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
        externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(SOLANA_RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(SOLANA_WS_URL),
              blockExplorerUrl: "https://explorer.solana.com",
            },
          },
        },
        defaultChain: polygon,
        supportedChains: [
          addRpcUrlOverrideToChain(polygon, POLYGON_RPC_URL as string),
          {
            id: 56,
            name: "BNB Smart Chain",
            network: "bsc",
            nativeCurrency: {
              name: "BNB",
              symbol: "BNB",
              decimals: 18,
            },
            rpcUrls: {
              default: {
                http: ["https://bsc-dataseed.binance.org"],
              },
              public: {
                http: ["https://bsc-dataseed.binance.org"],
              },
            },
            blockExplorers: {
              default: {
                name: "BscScan",
                url: "https://bscscan.com",
              },
            },
          },
        ],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
