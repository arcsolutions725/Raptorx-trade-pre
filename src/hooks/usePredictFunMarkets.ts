/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";



import { useState, useMemo, useEffect, useRef } from "react";

import { useQuery } from "@tanstack/react-query";

import type { LimitlessMarket } from "@/hooks/useLimitlessMarkets";

import {
  mapPredictFunApiMarketToRow,
  predictFunChildToCardSubMarket,
  predictFunFirstOutcomeAskCents,
  predictFunOutcomeAskCents,
  type PredictFunApiMarket,
} from "@/lib/predictfun/mapPredictFunMarketRow";

import { isPredictFunMarketOpen } from "@/lib/predictfun/filterOpenMarkets";

import { normalizePredictFunTagId } from "@/lib/predictfun/normalizeTagId";
import { predictFunSortForTagId } from "@/lib/predictfun/navigation";
import { PREDICT_FUN_CATEGORIES_PAGE_SIZE } from "@/lib/predictfun/serverFetch";



export type PredictFunMarketRow = LimitlessMarket & {

  _source: "predictfun";

  slug: string;

  predictFunMarketId: number;

};

type PredictFunCategoryNode = {
  id?: string | number;
  slug?: string;
  title?: string;
  imageUrl?: string | null;
  startsAt?: string | null;
  status?: string;
  statistics?: {
    volume24hUsd?: number;
    volumeTotalUsd?: number;
    liquidityValueUsd?: number;
    totalLiquidityUsd?: number;
  };
  marketData?: Array<{
    title?: string;
    chancePercentage?: number;
    statistics?: { volume24hUsd?: number; volumeTotalUsd?: number };
  }>;
  markets?:
    | { edges?: Array<{ node?: { id?: string | number; title?: string; chancePercentage?: number; statistics?: { volume24hUsd?: number; volumeTotalUsd?: number } } }> }
    | Array<{ id?: string | number; title?: string; chancePercentage?: number; statistics?: { volume24hUsd?: number; volumeTotalUsd?: number } }>;
};



function extractCategoryNodes(json: any): PredictFunCategoryNode[] {
  const direct = Array.isArray(json?.data) ? json.data : null;
  if (direct) return direct as PredictFunCategoryNode[];

  const edges = json?.data?.categories?.edges;
  if (Array.isArray(edges)) {
    return edges
      .map((e: any) => e?.node)
      .filter((n: any) => n && typeof n === "object") as PredictFunCategoryNode[];
  }

  return [];
}

function centsFromFirstOutcomeAsk(
  market: PredictFunApiMarket | null | undefined
): number | string {
  const cents = predictFunFirstOutcomeAskCents(market);
  return cents == null ? "—" : cents;
}

function mapCategoryNodeToRow(node: PredictFunCategoryNode): PredictFunMarketRow {
  const slug = String(node.slug ?? node.id ?? "").trim() || String(node.id ?? "");
  const id = String(node.id ?? slug);

  const childFromEdges = Array.isArray((node.markets as any)?.edges)
    ? ((node.markets as any).edges as any[])
        .map((e) => e?.node)
        .filter((m) => m && typeof m === "object")
    : [];
  const childFromArray = Array.isArray(node.markets) ? (node.markets as any[]) : [];
  const childFromMarketData = Array.isArray(node.marketData) ? node.marketData : [];
  const children = (
    childFromEdges.length > 0
      ? childFromEdges
      : childFromArray.length > 0
        ? childFromArray
        : childFromMarketData
  ) as PredictFunApiMarket[];

  const ranked = [...children].sort((a, b) => {
    const pa = predictFunFirstOutcomeAskCents(a) ?? -1;
    const pb = predictFunFirstOutcomeAskCents(b) ?? -1;
    if (pa !== pb) return pb - pa;
    const va = Number(
      a?.stats?.volume24hUsd ??
        a?.statistics?.volume24hUsd ??
        a?.statistics?.volumeTotalUsd ??
        0
    );
    const vb = Number(
      b?.stats?.volume24hUsd ??
        b?.statistics?.volume24hUsd ??
        b?.statistics?.volumeTotalUsd ??
        0
    );
    return vb - va;
  });
  const first = ranked[0];
  const second = ranked[1];

  let choiceI: string | number = "—";
  let choiceII: string | number = "—";
  let yesPrice: string | number = "—";
  let noPrice: string | number = "—";

  const outs = Array.isArray(first?.outcomes) ? first.outcomes : [];
  const isBinarySingleMarket = ranked.length === 1 && outs.length >= 2;
  const isBinaryTwoMarkets = ranked.length === 2;

  if (isBinarySingleMarket) {
    const yesIdx = outs.findIndex((o) => /^yes$/i.test(String(o?.name ?? "").trim()));
    const noIdx = outs.findIndex((o) => /^no$/i.test(String(o?.name ?? "").trim()));
    const yCents =
      yesIdx >= 0
        ? predictFunOutcomeAskCents(first, yesIdx)
        : predictFunOutcomeAskCents(first, 0);
    const nCents =
      noIdx >= 0
        ? predictFunOutcomeAskCents(first, noIdx)
        : predictFunOutcomeAskCents(first, 1);
    yesPrice = yCents == null ? "—" : yCents;
    noPrice = nCents == null ? "—" : nCents;
  } else if (isBinaryTwoMarkets) {
    const yCents = predictFunFirstOutcomeAskCents(first);
    const nCents = predictFunFirstOutcomeAskCents(second);
    yesPrice = yCents == null ? "—" : yCents;
    noPrice = nCents == null ? "—" : nCents;
  } else {
    // Multi-outcome: top two sub-market asks in Choice I/II only (Polymarket-style).
    choiceI = centsFromFirstOutcomeAsk(first);
    choiceII = centsFromFirstOutcomeAsk(second);
  }

  const nodeVol24 = Number(
    (node as any)?.statistics?.volume24hUsd ??
      (node as any)?.stats?.volume24hUsd ??
      (node as any)?.stats?.volume24h ??
      0
  );
  const nodeVolTotal = Number(
    (node as any)?.statistics?.volumeTotalUsd ??
      (node as any)?.stats?.volumeTotalUsd ??
      0
  );
  const childVol24 = ranked.reduce((sum: number, m) => {
    return (
      sum +
      Number(
        m?.stats?.volume24hUsd ??
          m?.statistics?.volume24hUsd ??
          m?.stats?.volumeTotalUsd ??
          m?.statistics?.volumeTotalUsd ??
          0
      )
    );
  }, 0);
  const vol24 = nodeVol24 > 0 ? nodeVol24 : childVol24;
  const volTotal =
    nodeVolTotal > 0
      ? nodeVolTotal
      : ranked.reduce((sum, m) => {
          return sum + Number(m?.stats?.volumeTotalUsd ?? m?.statistics?.volumeTotalUsd ?? 0);
        }, 0);
  const liquidity = Number(
    (node as any)?.statistics?.liquidityValueUsd ??
      (node as any)?.statistics?.totalLiquidityUsd ??
      (node as any)?.stats?.totalLiquidityUsd ??
      0
  );

  // Card view: Polymarket-style sub-market rows (label + % + Yes/No bar per child).
  const cardSubMarkets = isBinarySingleMarket
    ? []
    : ranked.map((m) => predictFunChildToCardSubMarket(m));

  return {
    id: slug || id,
    ticker: slug || id,
    slug: slug || id,
    title: node.title ?? slug ?? id,
    image: node.imageUrl ?? undefined,
    icon: node.imageUrl ?? undefined,
    active: String(node.status ?? "").toUpperCase() !== "CLOSED",
    closed: false,
    archived: false,
    volume: volTotal,
    volume24hr: vol24,
    liquidity,
    markets: cardSubMarkets,
    yesPrice,
    noPrice,
    choiceI,
    choiceII,
    rawEventData: node,
    _source: "predictfun",
    predictFunMarketId: Number(first?.id ?? id) || 0,
  };
}



/**

 * @param tagId Tag id from static nav (e.g. "3" for New), or null for All.

 */

export function usePredictFunMarkets(
  tagId: string | number | null = null,
  searchQuery: string | null = null,
  enabled: boolean = true
) {
  const normalizedTagId = normalizePredictFunTagId(tagId);

  const [pageSize, setPageSize] = useState(PREDICT_FUN_CATEGORIES_PAGE_SIZE);

  const [pageIndex, setPageIndex] = useState(1);

  const cursorsRef = useRef<(string | null)[]>([null]);



  useEffect(() => {

    setPageIndex(1);

    cursorsRef.current = [null];

  }, [searchQuery, normalizedTagId, pageSize]);



  const afterCursor = cursorsRef.current[pageIndex - 1] ?? null;



  const query = useQuery({

    queryKey: [
      "predictfun-markets",
      normalizedTagId,
      searchQuery,
      pageSize,
      pageIndex,
      afterCursor,
    ],

    enabled,

    queryFn: async () => {

      const q = searchQuery?.trim();

      if (q) {

        const params = new URLSearchParams({

          query: q,

          limit: String(pageSize),

          includeStats: "true",

        });

        const res = await fetch(`/api/predictfun/search?${params}`, {

          cache: "no-store",

        });

        if (!res.ok) {

          const err = await res.json().catch(() => ({ error: res.statusText }));

          throw new Error(err.error || "Predict.fun search failed");

        }

        const json = await res.json();

        const rawMarkets =

          json?.data?.markets ??

          json?.data?.market ??

          (Array.isArray(json?.data) ? json.data : []);

        const markets = (Array.isArray(rawMarkets) ? rawMarkets : []).filter((m) =>

          isPredictFunMarketOpen(m)

        );

        return { data: markets, cursor: null as string | null };

      }



      const params = new URLSearchParams({
        status: "OPEN",
        first: String(pageSize),
        sort: predictFunSortForTagId(normalizedTagId),
        includeStats: "true",
      });
      if (afterCursor?.trim()) params.set("after", afterCursor.trim());
      if (normalizedTagId) params.set("tagIds", normalizedTagId);

      const res = await fetch(`/api/predictfun/categories?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Predict.fun categories failed");
      }
      const json = await res.json();
      const nodes = extractCategoryNodes(json);
      const rows = nodes.map(mapCategoryNodeToRow);
      return { data: rows, cursor: (json?.cursor ?? json?.data?.categories?.pageInfo?.endCursor ?? null) as string | null };

    },

    staleTime: 30_000,

  });



  useEffect(() => {

    const cursor = (query.data as any)?.cursor;

    if (typeof cursor === "string" && cursor) {

      const next = [...cursorsRef.current];

      next[pageIndex] = cursor;

      cursorsRef.current = next;

    }

  }, [query.data, pageIndex]);



  const markets = useMemo(() => {

    const data = (query.data as any)?.data;

    if (!Array.isArray(data)) return [];

    const first = data[0];
    const looksLikeRow = first && typeof first === "object" && first._source === "predictfun";
    if (looksLikeRow) return data as PredictFunMarketRow[];

    return (data as any[]).map((m) => mapPredictFunApiMarketToRow(m)) as PredictFunMarketRow[];

  }, [query.data]);



  const hasNext = Boolean((query.data as any)?.cursor);

  const hasPrev = pageIndex > 1;



  return {

    markets,

    isLoading: query.isLoading,

    isError: query.isError,

    error: query.error as Error | null,

    refetch: query.refetch,

    isFetching: query.isFetching,

    pageIndex,

    pageSize,

    totalPages: undefined as number | undefined,

    hasPrev,

    hasNext,

    nextPage: () => {

      if (hasNext) setPageIndex((p) => p + 1);

    },

    prevPage: () => {

      if (hasPrev) setPageIndex((p) => p - 1);

    },

    setPageIndex,

    setPageSize,

    isPageLoading: query.isFetching,

  };

}


