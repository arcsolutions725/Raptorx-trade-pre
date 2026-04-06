import { SwapWidget } from "./SwapWidget";

interface DexSwapperProps {
  currentUserId: string;
  toTokenAddress?: string | null;
  forceChain?: "solana" | "bsc" | "base" | "monad";
  /** Wallet address that performed the swap (for LiFi tracking) */
  walletAddress?: string | null;
}

export function DexSwapper({ currentUserId, toTokenAddress, forceChain, walletAddress }: DexSwapperProps) {
  return (
    <SwapWidget
      currentUserId={currentUserId}
      toTokenAddress={toTokenAddress}
      forceChain={forceChain}
      walletAddress={walletAddress}
    />
  );
}
