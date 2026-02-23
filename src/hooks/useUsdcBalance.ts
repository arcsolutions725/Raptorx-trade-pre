"use client";

import { useQuery } from "@tanstack/react-query";
import { Connection, PublicKey } from "@solana/web3.js";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type UsdcBalanceResult = {
  /** USDC amount in USD (6 decimals → human) */
  amount: number;
  rawAmount: string;
  formatted: string;
} | null;

/**
 * Fetches USDC balance for a Solana wallet via RPC (parsed token accounts by owner + mint).
 */
export function useUsdcBalance(solanaAddress: string | null) {
  return useQuery({
    queryKey: ["usdc-balance", solanaAddress],
    queryFn: async (): Promise<UsdcBalanceResult> => {
      if (!solanaAddress) return null;
      const connection = new Connection(SOLANA_RPC, "confirmed");
      const owner = new PublicKey(solanaAddress);
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
        mint: new PublicKey(USDC_MINT),
      });
      if (accounts.value.length === 0) {
        return { amount: 0, rawAmount: "0", formatted: "0.00" };
      }
      const info = (accounts.value[0].account.data as { parsed?: { info?: { tokenAmount?: { uiAmount: number | null; amount: string } } } }).parsed?.info;
      const tokenAmount = info?.tokenAmount;
      const amount = tokenAmount?.uiAmount ?? 0;
      const rawAmount = tokenAmount?.amount ?? "0";
      return {
        amount,
        rawAmount,
        formatted: amount.toFixed(2),
      };
    },
    enabled: !!solanaAddress,
    staleTime: 30_000,
  });
}
