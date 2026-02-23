"use client";

import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";

/** Privy linked account that is a wallet with address and chainType */
type PrivyWalletLinkedAccount = {
  type: string;
  address?: string;
  chainType?: string;
};

/**
 * Returns the current user's Ethereum/BNB (EVM) wallet address from either Phantom or Privy.
 * Used to persist ethereumWallet in the DB and show in user profile modal only.
 */
export function useEthereumWalletAddress(): {
  ethereumAddress: string | null;
  source: "phantom" | "privy" | null;
  isLoading: boolean;
} {
  const { user: phantomUser, isAuthenticated: phantomAuthenticated } =
    usePhantomConnect();
  const { authenticated: privyAuthenticated, ready: privyReady, user: privyUser } =
    usePrivy();

  // Phantom: Ethereum address (BNB/EVM)
  const phantomEthereum =
    phantomAuthenticated && phantomUser?.ethereumWallet
      ? phantomUser.ethereumWallet
      : null;

  // Privy: get Ethereum address from user.linkedAccounts (wallets with chainType 'ethereum').
  const linkedAccounts = (privyUser as { linkedAccounts?: PrivyWalletLinkedAccount[] })
    ?.linkedAccounts ?? [];
  const privyEthereumAccount = linkedAccounts.find(
    (acc) =>
      acc.type === "wallet" &&
      (acc as PrivyWalletLinkedAccount).chainType === "ethereum" &&
      typeof (acc as PrivyWalletLinkedAccount).address === "string"
  ) as PrivyWalletLinkedAccount | undefined;
  const privyEthereum =
    privyAuthenticated && privyEthereumAccount?.address
      ? privyEthereumAccount.address
      : null;

  const ethereumAddress = phantomEthereum || privyEthereum || null;
  const source = phantomEthereum
    ? "phantom"
    : privyEthereum
      ? "privy"
      : null;

  const isLoading = privyAuthenticated && !privyReady;

  return {
    ethereumAddress,
    source,
    isLoading,
  };
}
