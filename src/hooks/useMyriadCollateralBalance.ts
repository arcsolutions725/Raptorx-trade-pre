"use client";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits } from "viem";
import { useWallet } from "@/contexts/WalletContext";
import { myriadBscPublicClient } from "@/lib/myriad/bscPublicClient";

/**
 * On-chain ERC20 balance on BSC for Myriad collateral (e.g. USD1).
 */
export function useMyriadCollateralBalance(
  tokenAddress: string | undefined,
  decimals: number,
  enabled: boolean
) {
  const { eoaAddress } = useWallet();

  return useQuery({
    queryKey: ["myriad-erc20-balance", tokenAddress, eoaAddress, decimals],
    enabled: Boolean(enabled && tokenAddress && eoaAddress),
    queryFn: async () => {
      const bal = await myriadBscPublicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [eoaAddress as `0x${string}`],
      });
      return Number(formatUnits(bal, decimals));
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}
