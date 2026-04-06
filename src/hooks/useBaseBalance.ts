"use client";

import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { base } from "viem/chains";
import { useQuery } from "@tanstack/react-query";
import { BASE_RPC_URL } from "@/constants/api";
import { USDC_BASE_ADDRESS, USDC_BASE_DECIMALS } from "@/constants/tokens";
import { QUERY_STALE_TIMES, QUERY_REFETCH_INTERVALS } from "@/constants/query";

const basePublicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

/**
 * Returns ETH and USDC balances on Base for the given address.
 * Used by Limitless (trading is on Base).
 */
export function useBaseBalance(address: `0x${string}` | undefined) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["baseBalance", address],
    queryFn: async () => {
      if (!address) return null;

      const [ethBalance, usdcBalance] = await Promise.all([
        basePublicClient.getBalance({ address }),
        basePublicClient.readContract({
          address: USDC_BASE_ADDRESS as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);

      const usdcFormatted = parseFloat(
        formatUnits(usdcBalance, USDC_BASE_DECIMALS)
      );
      const ethFormatted = formatUnits(ethBalance, 18);

      return {
        ethBalance,
        usdcBalance: usdcFormatted,
        usdcBalanceFormatted: usdcFormatted.toFixed(2),
        ethBalanceFormatted: ethFormatted,
      };
    },
    enabled: !!address,
    staleTime: QUERY_STALE_TIMES.BALANCE,
    refetchInterval: QUERY_REFETCH_INTERVALS.BALANCE,
    refetchOnWindowFocus: true,
  });

  return {
    usdcBalance: data?.usdcBalance ?? 0,
    usdcBalanceFormatted: data?.usdcBalanceFormatted ?? "0.00",
    ethBalanceFormatted: data?.ethBalanceFormatted ?? "0",
    isLoading,
    isError: !!error,
    refetch,
  };
}
