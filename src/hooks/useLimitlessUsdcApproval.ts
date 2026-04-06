"use client";

import { useState, useCallback } from "react";
import { createPublicClient, createWalletClient, http, custom, parseUnits } from "viem";
import { base } from "viem/chains";
import { erc20Abi } from "viem";
import { useQuery } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { BASE_RPC_URL } from "@/constants/api";
import { USDC_BASE_ADDRESS, USDC_BASE_DECIMALS } from "@/constants/tokens";

const MAX_UINT256 = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935"
);

const basePublicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

/**
 * Check USDC allowance on Base for Limitless venue.exchange.
 * BUY orders require USDC → venue.exchange per Limitless API docs.
 */
export function useLimitlessUsdcApproval(
  ownerAddress: `0x${string}` | undefined,
  venueExchange: string | null | undefined,
  requiredAmountUsd: number
) {
  const { wallets } = useWallets();
  const [isApproving, setIsApproving] = useState(false);

  const requiredRaw = parseUnits(
    Math.max(0, requiredAmountUsd).toFixed(USDC_BASE_DECIMALS),
    USDC_BASE_DECIMALS
  );

  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useQuery({
    queryKey: ["limitless-usdc-allowance", ownerAddress, venueExchange],
    queryFn: async () => {
      if (!ownerAddress || !venueExchange?.trim()) return null;
      const spender = venueExchange.trim() as `0x${string}`;
      const value = await basePublicClient.readContract({
        address: USDC_BASE_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: "allowance",
        args: [ownerAddress, spender],
      });
      return value;
    },
    enabled: !!ownerAddress && !!venueExchange?.trim(),
  });

  const hasEnoughAllowance = allowance != null && allowance >= requiredRaw;

  const approve = useCallback(async (): Promise<boolean> => {
    if (!ownerAddress || !venueExchange?.trim()) return false;
    const eoa = ownerAddress.toLowerCase();
    const wallet = wallets?.find(
      (w) => (w.address as string).toLowerCase() === eoa
    );
    if (!wallet) return false;

    const provider = await (wallet as { getEthereumProvider?: () => Promise<unknown> }).getEthereumProvider?.();
    if (!provider) return false;

    const walletWithSwitch = wallet as {
      chainId?: string | number;
      switchChain?: (chainId: number) => Promise<void>;
    };
    const currentChainId = walletWithSwitch.chainId;
    const isOnBase =
      currentChainId === base.id ||
      currentChainId === `eip155:${base.id}` ||
      currentChainId === String(base.id);
    if (!isOnBase && typeof walletWithSwitch.switchChain === "function") {
      await walletWithSwitch.switchChain(base.id);
    }

    const client = createWalletClient({
      account: ownerAddress,
      chain: base,
      transport: custom(provider as Parameters<typeof custom>[0]),
    });

    setIsApproving(true);
    try {
      await client.writeContract({
        address: USDC_BASE_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [venueExchange.trim() as `0x${string}`, MAX_UINT256],
      });
      await refetchAllowance();
      return true;
    } catch (e) {
      console.warn("Limitless USDC approve failed:", e);
      return false;
    } finally {
      setIsApproving(false);
    }
  }, [ownerAddress, venueExchange, wallets, refetchAllowance]);

  return {
    allowance,
    hasEnoughAllowance: !!hasEnoughAllowance,
    isLoadingAllowance,
    isApproving,
    approve,
    refetchAllowance,
  };
}
