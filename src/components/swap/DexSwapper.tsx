import { SwapWidget } from "./SwapWidget";

interface DexSwapperProps {
  currentUserId: string;
  toTokenAddress?: string | null;
  forceChain?: "solana" | "bsc";
}

export function DexSwapper({ currentUserId, toTokenAddress, forceChain }: DexSwapperProps) {
  return (
    <SwapWidget currentUserId={currentUserId} toTokenAddress={toTokenAddress} forceChain={forceChain} />
  );
}
