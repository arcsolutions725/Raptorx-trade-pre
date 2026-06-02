"use client";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatEther, formatUnits, parseEther } from "viem";
import { myriadBscPublicClient } from "@/lib/myriad/bscPublicClient";

/** Native BNB kept on the wallet for gas after a max BNB withdraw (shown in Deposit/Withdraw). */
export const MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB = "0.002" as const;

function trimEtherDisplay(s: string, maxFractionDigits = 8): string {
  if (!s.includes(".")) return s || "0";
  const [whole, frac = ""] = s.split(".");
  const cut = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  if (!cut) return whole || "0";
  return `${whole}.${cut}`;
}

const gasReserveWeiCached = parseEther(MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB);

/** BSC mainnet — Myriad AMM collateral is often USD1 (World Liberty); plus common BEP-20 stables. */
export const MYRIAD_BSC_USD1 =
  "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" as const;
export const MYRIAD_BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
export const MYRIAD_BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const MYRIAD_BSC_STABLE_DECIMALS = 18;

const COINGECKO_BNB_USD =
  "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd";

export type MyriadBscBalances = {
  /** Native BNB balance (wei), decimal string — use for exact comparisons. */
  bnbWei: string;
  /** Max native BNB sendable while keeping {@link MYRIAD_BNB_WITHDRAW_GAS_RESERVE_BNB} for gas (wei string). */
  bnbMaxSendAfterReserveWei: string;
  /** Human-readable max BNB after gas reserve; use for MAX / “available to send”. */
  bnbMaxSendAfterReserveFormatted: string;
  /** Approximate float for USD total only — prefer strings for amounts. */
  bnb: number;
  bnbFormatted: string;
  usd1: number;
  usd1Formatted: string;
  usdt: number;
  usdc: number;
  usdtFormatted: string;
  usdcFormatted: string;
  /** BNB/USD for total estimate; null if quote unavailable. */
  bnbUsdPrice: number | null;
  /** USD1 + USDT + USDC + BNB×BNB/USD (stables assumed ~$1). */
  totalUsdApprox: number;
};

async function fetchBnbUsd(): Promise<number | null> {
  try {
    const res = await fetch(COINGECKO_BNB_USD, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { binancecoin?: { usd?: number } };
    const p = data.binancecoin?.usd;
    return typeof p === "number" && p > 0 ? p : null;
  } catch {
    return null;
  }
}

/** Native BNB + USDT/USDC on BSC for Myriad deposit/withdraw UI. */
export function useMyriadBscBalances(address: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["myriad-bsc-balances", address],
    enabled: Boolean(enabled && address),
    queryFn: async (): Promise<MyriadBscBalances> => {
      const a = address as `0x${string}`;
      const [bnbWei, usd1Bal, usdtBal, usdcBal, bnbUsdPrice] = await Promise.all([
        myriadBscPublicClient.getBalance({ address: a }),
        myriadBscPublicClient.readContract({
          address: MYRIAD_BSC_USD1,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [a],
        }),
        myriadBscPublicClient.readContract({
          address: MYRIAD_BSC_USDT as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [a],
        }),
        myriadBscPublicClient.readContract({
          address: MYRIAD_BSC_USDC as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [a],
        }),
        fetchBnbUsd(),
      ]);
      const bnbHumanStr = formatEther(bnbWei);
      const bnb = parseFloat(bnbHumanStr);
      const maxSendAfterReserveWei =
        bnbWei > gasReserveWeiCached ? bnbWei - gasReserveWeiCached : BigInt(0);
      const usd1 = Number(formatUnits(usd1Bal, MYRIAD_BSC_STABLE_DECIMALS));
      const usdt = Number(formatUnits(usdtBal, MYRIAD_BSC_STABLE_DECIMALS));
      const usdc = Number(formatUnits(usdcBal, MYRIAD_BSC_STABLE_DECIMALS));
      const bnbUsd =
        bnbUsdPrice != null && Number.isFinite(bnb) ? bnb * bnbUsdPrice : 0;
      const totalUsdApprox = usd1 + usdt + usdc + bnbUsd;
      return {
        bnbWei: bnbWei.toString(),
        bnbMaxSendAfterReserveWei: maxSendAfterReserveWei.toString(),
        bnbMaxSendAfterReserveFormatted: trimEtherDisplay(
          formatEther(maxSendAfterReserveWei),
          18,
        ),
        bnb,
        bnbFormatted: trimEtherDisplay(bnbHumanStr, 18),
        usd1,
        usd1Formatted: formatUnits(usd1Bal, MYRIAD_BSC_STABLE_DECIMALS),
        usdt,
        usdc,
        usdtFormatted: formatUnits(usdtBal, MYRIAD_BSC_STABLE_DECIMALS),
        usdcFormatted: formatUnits(usdcBal, MYRIAD_BSC_STABLE_DECIMALS),
        bnbUsdPrice,
        totalUsdApprox,
      };
    },
    staleTime: 10_000,
    refetchInterval: 25_000,
  });
}
