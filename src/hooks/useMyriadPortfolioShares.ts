"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/contexts/WalletContext";

export type MyriadOutcomeShares = {
  byOutcomeId: Map<number, number>;
  /** Binary convenience: outcome API ids 0 / 1 */
  yes: number;
  no: number;
};

function parsePortfolioJson(json: unknown): MyriadOutcomeShares {
  const byOutcomeId = new Map<number, number>();
  let yes = 0;
  let no = 0;

  const rows = (() => {
    if (!json || typeof json !== "object") return [];
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.positions)) return o.positions;
    if (Array.isArray(o.items)) return o.items;
    return [];
  })();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const nestedOut = r.outcome && typeof r.outcome === "object" ? (r.outcome as Record<string, unknown>) : null;
    const oid = r.outcomeId ?? r.outcome_id ?? nestedOut?.id;
    const sh = r.shares ?? r.sharesHeld ?? r.amount ?? r.netShares ?? nestedOut?.shares;
    const n =
      typeof sh === "number"
        ? sh
        : typeof sh === "string"
          ? parseFloat(sh)
          : NaN;
    if (!Number.isFinite(n) || n < 0) continue;
    const id = typeof oid === "number" ? oid : typeof oid === "string" ? parseInt(oid, 10) : NaN;
    if (!Number.isFinite(id)) continue;
    byOutcomeId.set(id, n);
    if (id === 0) yes = n;
    if (id === 1) no = n;
  }

  return { byOutcomeId, yes, no };
}

/**
 * User’s net shares per outcome for a market (Myriad GET /users/.../portfolio?market_slug=).
 */
export function useMyriadPortfolioShares(
  marketSlug: string | undefined,
  networkId: number,
  enabled: boolean
) {
  const { eoaAddress } = useWallet();
  const slug = marketSlug?.trim();

  return useQuery({
    queryKey: ["myriad-user-portfolio", slug, eoaAddress, networkId],
    enabled: Boolean(enabled && slug && eoaAddress && networkId > 0),
    queryFn: async (): Promise<MyriadOutcomeShares> => {
      const params = new URLSearchParams({
        address: eoaAddress!,
        market_slug: slug!,
        network_id: String(networkId),
      });
      const res = await fetch(`/api/myriad/user-portfolio?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { byOutcomeId: new Map(), yes: 0, no: 0 };
      }
      return parsePortfolioJson(json);
    },
    staleTime: 10_000,
    refetchInterval: 25_000,
  });
}
