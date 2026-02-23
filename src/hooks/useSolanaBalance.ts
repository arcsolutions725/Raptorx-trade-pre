"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  clusterApiUrl("mainnet-beta");

export type SolanaBalanceParams = {
  solanaAddress: string | null;
  source: "phantom" | "privy" | null;
  privyUserId?: string | null;
};

export type SolanaBalanceResult = {
  lamports: number;
  sol: number;
  formatted: string;
} | null;

/**
 * Fetches SOL balance for the current Solana wallet.
 * Always uses Solana RPC (Connection.getBalance) when an address is available.
 * This ensures correct balance for both Phantom and Privy+Phantom: the chain is
 * the source of truth, and Privy's balance API can return 0 for linked Phantom wallets.
 */
export function useSolanaBalance(
  solanaAddress: string | null,
  _source?: "phantom" | "privy" | null,
  _privyUserId?: string | null
): ReturnType<typeof useQuery<SolanaBalanceResult>> {
  const enabled = !!solanaAddress;

  return useQuery({
    queryKey: ["solana-balance", solanaAddress],
    queryFn: async (): Promise<SolanaBalanceResult> => {
      if (!solanaAddress) return null;

      const connection = new Connection(SOLANA_RPC, "confirmed");
      const address = new PublicKey(solanaAddress);
      const lamports = await connection.getBalance(address);
      const sol = lamports / LAMPORTS_PER_SOL;
      return {
        lamports,
        sol,
        formatted: sol.toFixed(4),
      };
    },
    enabled,
    staleTime: 30_000, // 30s
  });
}
