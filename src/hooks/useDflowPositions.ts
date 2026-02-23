"use client";

import { useQuery } from "@tanstack/react-query";
import { Connection, PublicKey } from "@solana/web3.js";

const SOLANA_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

/** Token-2022 program ID (outcome tokens are Token-2022 mints). */
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

export type DFlowEmptyOutcomeAccount = {
  tokenAccountAddress: string;
  mint: string;
};

export type DFlowPositionsResult = {
  positions: DFlowPosition[];
  emptyOutcomeAccounts: DFlowEmptyOutcomeAccount[];
};

export type DFlowMarketAccount = {
  yesMint: string;
  noMint: string;
  isInitialized?: boolean;
  redemptionStatus?: string | null;
  /** Scalar outcome payout % for YES in basis points (0–10000). When set with result === "", both YES and NO are redeemable. */
  scalarOutcomePct?: number | null;
};

export type DFlowMarket = {
  ticker?: string;
  eventTicker?: string;
  title?: string;
  question?: string;
  subtitle?: string;
  openTime?: number;
  closeTime?: number;
  expirationTime?: number;
  status?: string;
  /** Market result: "yes" | "no" | "" (empty for scalar outcomes). Used for redeemability. */
  result?: string;
  rulesPrimary?: string;
  rulesSecondary?: string;
  accounts?: Record<string, DFlowMarketAccount>;
};

export type DFlowPosition = {
  mint: string;
  balance: number;
  rawBalance: string;
  decimals: number;
  position: "YES" | "NO" | "UNKNOWN";
  market: DFlowMarket | null;
  /** Redemption status of the settlement account that holds this outcome (yesMint/noMint). */
  redemptionStatus: string | null;
  /** Scalar outcome payout % for YES (basis points). When set, position is redeemable even if result === "". */
  scalarOutcomePct?: number | null;
};

async function fetchDflowPositions(walletAddress: string): Promise<DFlowPositionsResult> {
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const userWallet = new PublicKey(walletAddress);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    userWallet,
    { programId: TOKEN_2022_PROGRAM_ID }
  );

  const userTokens = tokenAccounts.value.map(
    ({ pubkey, account }: { pubkey: PublicKey; account: unknown }) => {
      const info = (account as { data: { parsed: { info: Record<string, unknown> } } })
        .data.parsed.info;
      const tokenAmount = (info.tokenAmount as { amount: string; uiAmount: number | null; decimals: number }) ?? {};
      return {
        tokenAccountAddress: pubkey.toBase58(),
        mint: info.mint as string,
        rawBalance: tokenAmount.amount ?? "0",
        balance: tokenAmount.uiAmount ?? 0,
        decimals: tokenAmount.decimals ?? 6,
      };
    }
  );

  const allMintAddresses = [...new Set(userTokens.map((t) => t.mint))];
  if (allMintAddresses.length === 0) {
    return { positions: [], emptyOutcomeAccounts: [] };
  }

  const filterRes = await fetch("/api/kalshi/dflow-filter-outcome-mints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: allMintAddresses }),
  });
  if (!filterRes.ok) {
    const err = await filterRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to filter outcome mints"
    );
  }
  const filterData = (await filterRes.json()) as { outcomeMints?: string[] };
  const outcomeMints = filterData.outcomeMints ?? [];
  const outcomeUserTokens = userTokens.filter((t) => outcomeMints.includes(t.mint));

  const nonZeroBalances = outcomeUserTokens.filter((t) => t.balance > 0);
  const emptyAccounts = outcomeUserTokens.filter((t) => t.balance === 0);
  const emptyOutcomeAccounts: DFlowEmptyOutcomeAccount[] = emptyAccounts.map((e) => ({
    tokenAccountAddress: e.tokenAccountAddress,
    mint: e.mint,
  }));

  if (nonZeroBalances.length === 0) {
    return { positions: [], emptyOutcomeAccounts };
  }

  const batchRes = await fetch("/api/kalshi/dflow-markets-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mints: [...new Set(nonZeroBalances.map((t) => t.mint))] }),
  });
  if (!batchRes.ok) {
    const err = await batchRes.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to fetch markets batch"
    );
  }
  const batchData = (await batchRes.json()) as { markets?: DFlowMarket[] };
  const markets = batchData.markets ?? [];

  const marketsByMint = new Map<string, DFlowMarket>();
  markets.forEach((market: DFlowMarket) => {
    const accounts = Object.values(market.accounts ?? {});
    accounts.forEach((acc) => {
      if (acc.yesMint) marketsByMint.set(acc.yesMint, market);
      if (acc.noMint) marketsByMint.set(acc.noMint, market);
    });
  });

  const positions: DFlowPosition[] = nonZeroBalances.map((token) => {
    const market = marketsByMint.get(token.mint) ?? null;
    if (!market) {
      return {
        mint: token.mint,
        balance: token.balance,
        rawBalance: token.rawBalance,
        decimals: token.decimals,
        position: "UNKNOWN",
        market: null,
        redemptionStatus: null,
        scalarOutcomePct: null,
      };
    }
    const accounts = Object.values(market.accounts ?? {});
    const accountForMint = accounts.find(
      (a) => a.yesMint === token.mint || a.noMint === token.mint
    );
    const isYesToken = accounts.some((a) => a.yesMint === token.mint);
    const isNoToken = accounts.some((a) => a.noMint === token.mint);
    const position = isYesToken ? "YES" : isNoToken ? "NO" : "UNKNOWN";
    return {
      mint: token.mint,
      balance: token.balance,
      rawBalance: token.rawBalance,
      decimals: token.decimals,
      position,
      market,
      redemptionStatus: accountForMint?.redemptionStatus ?? null,
      scalarOutcomePct: accountForMint?.scalarOutcomePct ?? null,
    };
  });

  return { positions, emptyOutcomeAccounts };
}

/**
 * Fetches the current user's DFlow (Kalshi) prediction market positions and empty outcome token accounts.
 * Uses Solana Token-2022 token accounts, DFlow filter_outcome_mints and markets/batch.
 * Empty accounts can be closed to reclaim rent (see close-outcome-token-accounts recipe).
 * Docs: https://pond.dflow.net/build/recipes/prediction-markets/track-positions
 * Docs: https://pond.dflow.net/build/recipes/prediction-markets/close-outcome-token-accounts
 */
export function useDflowPositions(solanaAddress: string | null) {
  return useQuery({
    queryKey: ["dflow-positions", solanaAddress],
    queryFn: () => fetchDflowPositions(solanaAddress!),
    enabled: !!solanaAddress,
    staleTime: 60_000,
  });
}
