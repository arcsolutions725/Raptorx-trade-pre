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
 * Returns the current user's Solana wallet address from either Phantom or Privy.
 * For Privy we read from user.linkedAccounts (wallets with chainType 'solana') so that
 * existing users who never had solanaWallet saved in our DB will have it fetched and persisted.
 */
export function useSolanaWalletAddress(): {
  solanaAddress: string | null;
  source: "phantom" | "privy" | null;
  isLoading: boolean;
} {
  const { user: phantomUser, isAuthenticated: phantomAuthenticated } =
    usePhantomConnect();
  const { authenticated: privyAuthenticated, ready: privyReady, user: privyUser } =
    usePrivy();

  // Phantom: primary Solana address
  const phantomSolana =
    phantomAuthenticated && phantomUser?.solanaWallet
      ? phantomUser.solanaWallet
      : null;

  // Privy: get Solana address from user.linkedAccounts (wallets with chainType 'solana').
  // This is the correct source for Privy - the main useWallets() returns only Ethereum wallets.
  const linkedAccounts = (privyUser as { linkedAccounts?: PrivyWalletLinkedAccount[] })
    ?.linkedAccounts ?? [];
  const privySolanaAccount = linkedAccounts.find(
    (acc) =>
      acc.type === "wallet" &&
      (acc as PrivyWalletLinkedAccount).chainType === "solana" &&
      typeof (acc as PrivyWalletLinkedAccount).address === "string"
  ) as PrivyWalletLinkedAccount | undefined;
  const privySolana =
    privyAuthenticated && privySolanaAccount?.address
      ? privySolanaAccount.address
      : null;

  // Prefer Phantom if user is logged in with Phantom and has Solana; else Privy
  const solanaAddress = phantomSolana || privySolana || null;
  const source = phantomSolana
    ? "phantom"
    : privySolana
      ? "privy"
      : null;

  const isLoading = privyAuthenticated && !privyReady;

  return {
    solanaAddress,
    source,
    isLoading,
  };
}
