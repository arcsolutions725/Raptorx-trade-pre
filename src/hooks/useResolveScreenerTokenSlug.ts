"use client";

import { useQuery } from "@tanstack/react-query";
import type { Chain, TrendingToken } from "@/hooks/useTrendingTokens";
import {
  normalizeTokenPathSlug,
  tokenMatchesChain,
  tokenMatchesPathSegment,
  isEvmContractAddress,
  isSolanaMintAddress,
} from "@/lib/rexscreenerRoutes";

function extractItems(payload: unknown): TrendingToken[] {
  const p = payload as { items?: unknown; result?: unknown };
  if (Array.isArray(p?.items))
    return p.items.filter((x): x is TrendingToken => x && typeof x === "object");
  if (Array.isArray(p?.result))
    return p.result.filter((x): x is TrendingToken => x && typeof x === "object");
  if (Array.isArray(payload))
    return (payload as TrendingToken[]).filter(
      (x) => x && typeof x === "object"
    );
  return [];
}

async function resolveToken(
  chain: Chain,
  pathSlug: string
): Promise<TrendingToken | null> {
  const normalized = normalizeTokenPathSlug(pathSlug);
  if (!normalized || chain === "all") return null;

  const verifiedOnly = chain === "solana";

  const searchWith = async (
    search_query: string,
    search_type: "ticker" | "address"
  ) => {
    const res = await fetch("/api/trending", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        limit: 50,
        offset: 0,
        chain,
        sort_by: "v24hUSD",
        sort_type: "desc",
        min_liquidity: 100,
        ui_amount_mode: "scaled",
        verified_only: verifiedOnly,
        search_query,
        search_type,
      }),
    });
    if (!res.ok) return [] as TrendingToken[];
    const data = await res.json();
    return extractItems(data);
  };

  let rows: TrendingToken[] = [];

  if (isEvmContractAddress(pathSlug) || isSolanaMintAddress(pathSlug)) {
    rows = await searchWith(pathSlug.trim(), "address");
    const trimmed = pathSlug.trim();
    const exact = rows.find(
      (t) =>
        tokenMatchesChain(t, chain) &&
        (isSolanaMintAddress(trimmed)
          ? (t.tokenAddress || "") === trimmed
          : (t.tokenAddress || "").toLowerCase() === trimmed.toLowerCase())
    );
    if (exact) return exact;
    const loose = rows.filter((t) => tokenMatchesChain(t, chain));
    return loose[0] ?? null;
  }

  const tickerQuery = pathSlug.replace(/[-_]+/g, " ").trim();
  rows = await searchWith(tickerQuery || pathSlug, "ticker");

  const filtered = rows.filter(
    (t) =>
      tokenMatchesChain(t, chain) &&
      tokenMatchesPathSegment(t, pathSlug, normalized)
  );
  return filtered[0] ?? null;
}

export function useResolveScreenerTokenSlug(
  chain: Chain,
  pathSlug: string | null
) {
  const normalizedSlug = pathSlug ? normalizeTokenPathSlug(pathSlug) : "";
  const enabled =
    Boolean(pathSlug) && chain !== "all" && normalizedSlug.length > 0;

  return useQuery({
    queryKey: ["screener-token-slug", chain, normalizedSlug],
    queryFn: () => resolveToken(chain, pathSlug!),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}
