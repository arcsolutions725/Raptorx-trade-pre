/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useDataSource } from "@/contexts/DataSourceContext";

/** Stable cache key for a market - avoids duplicate API calls across components. */
function getMarketCacheId(md: any): string {
  if (!md || typeof md !== "object") return "";
  return (
    md.ticker ??
    md.series_ticker ??
    md.event_ticker ??
    md.event_id ??
    md.slug ??
    md.id ??
    ""
  );
}

export type MarketOutcome = {
  ticker: string;
  condition_id?: string; // Condition ID for Polymarket CLOB API (token ID)
  clob_token_id?: string; // First CLOB token ID (Yes token) for prices-history API
  clob_no_token_id?: string; // Second CLOB token ID (No token) for trading
  market_id?: string; // Market ID for Polymarket holders API or Kalshi price history API
  subtitle: string;
  groupItemTitle?: string; // Group item title for Polymarket markets
  probability: number;
  yes_price: number;
  no_price: number;
  volume: number;
  volume_24h?: number;
  yes_bid: number;
  yes_ask: number;
  liquidity: number;
  open_interest: number;
  status: string;
  result?: string;
  open_time?: string | null;
  close_time?: string | null;
  expected_expiration_time?: string | null;
};

export type MarketDetails = {
  series_ticker: string;
  title: string;
  subtitle?: string;
  category: string;
  markets: MarketOutcome[];
  total_volume: number;
  total_series_volume: number;
  symbol_image_url: string;
  open_time?: string | null;
  close_time?: string | null;
  expected_expiration_time?: string | null;
  event_ticker?: string;
  ranged_group_name?: string;
  ticker?: string; // For Polymarket
  series_id?: string | null; // Series ID for comments API
  event_id?: string | null; // Event ID for reference
  id?: string | null; // Limitless / provider-specific event or market id
  // Limitless / provider-specific optional fields
  image?: string | null;
  icon?: string | null;
  yesPrice?: number | string;
  noPrice?: number | string;
  prices?: (number | string)[];
  description?: string;
  liquidity?: number;
};

export function useMarketDetails(eventTicker: string | null, eventId?: string | null, slug?: string | null) {
  const { dataSource } = useDataSource();
  const pathname = usePathname();
  
  const query = useQuery({
    queryKey: ["market-details", eventTicker, eventId, slug, dataSource, pathname],
    queryFn: async () => {
      if (!eventTicker && !slug) return null;

      // Detect route inside queryFn to use current pathname value
      // Check pathname directly to ensure we use the most up-to-date value
      const currentPathname = typeof window !== "undefined" ? window.location.pathname : pathname;
      const isKalshiRoute = currentPathname?.startsWith("/rexmarkets/kalshi/");
      const isPolymarketRoute = currentPathname?.startsWith("/rexmarkets/polymarket/");
      const isLimitlessRoute = currentPathname?.startsWith("/rexmarkets/limitless/");

      // Determine which API endpoint to use
      let apiPath: string;
      
      // If we're on a Kalshi route, always use Kalshi API (highest priority)
      if (isKalshiRoute && eventTicker) {
        apiPath = `/api/kalshi/market-details?event_ticker=${encodeURIComponent(eventTicker)}`;
      }
      // If we're on a Polymarket route, always use Polymarket API
      else if (isPolymarketRoute) {
        if (slug) {
          apiPath = `/api/polymarket/market-details?slug=${encodeURIComponent(slug)}`;
        } else if (eventId) {
          apiPath = `/api/polymarket/market-details?event_id=${encodeURIComponent(eventId)}`;
        } else if (eventTicker) {
          apiPath = `/api/polymarket/market-details?event_ticker=${encodeURIComponent(eventTicker)}`;
        } else {
          return null;
        }
      }
      // If we're on a Limitless route, always use Limitless API
      else if (isLimitlessRoute) {
        if (slug) {
          apiPath = `/api/limitless/market-details?slug=${encodeURIComponent(slug)}`;
        } else if (eventId) {
          apiPath = `/api/limitless/market-details?id=${encodeURIComponent(eventId)}`;
        } else if (eventTicker) {
          apiPath = `/api/limitless/market-details?ticker=${encodeURIComponent(eventTicker)}`;
        } else {
          return null;
        }
      }
      // If slug is provided, check dataSource to determine API
      else if (slug) {
        if (dataSource === "limitless") {
          apiPath = `/api/limitless/market-details?slug=${encodeURIComponent(slug)}`;
        } else {
          // Default to Polymarket for slug (slug is Polymarket-specific)
          apiPath = `/api/polymarket/market-details?slug=${encodeURIComponent(slug)}`;
        }
      } else if (dataSource === "polymarket") {
        // For Polymarket, prioritize event_id, then ticker
        if (eventId) {
          apiPath = `/api/polymarket/market-details?event_id=${encodeURIComponent(eventId)}`;
        } else if (eventTicker) {
          apiPath = `/api/polymarket/market-details?event_ticker=${encodeURIComponent(eventTicker)}`;
        } else {
          return null;
        }
      } else if (dataSource === "limitless") {
        // For Limitless, prioritize slug, then id, then ticker
        if (slug) {
          apiPath = `/api/limitless/market-details?slug=${encodeURIComponent(slug)}`;
        } else if (eventId) {
          apiPath = `/api/limitless/market-details?id=${encodeURIComponent(eventId)}`;
        } else if (eventTicker) {
          apiPath = `/api/limitless/market-details?ticker=${encodeURIComponent(eventTicker)}`;
        } else {
          return null;
        }
      } else if (dataSource === "all") {
        // In "all" mode, try to detect source from available data
        // Polymarket markets typically have eventId, so try Polymarket first if available
        if (eventId) {
          apiPath = `/api/polymarket/market-details?event_id=${encodeURIComponent(eventId)}`;
        } else if (eventTicker) {
          // Default to Kalshi if no eventId (Kalshi markets don't use eventId in the same way)
          apiPath = `/api/kalshi/market-details?event_ticker=${encodeURIComponent(eventTicker)}`;
        } else {
          return null;
        }
      } else {
        // Default to Kalshi for kalshi mode or fallback
        if (eventTicker) {
          apiPath = `/api/kalshi/market-details?event_ticker=${encodeURIComponent(eventTicker)}`;
        } else {
          return null;
        }
      }

      const res = await fetch(apiPath, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errorData.error || `Failed to fetch market details: ${res.statusText}`);
      }

      return res.json() as Promise<MarketDetails>;
    },
    enabled: !!(eventTicker || slug),
    staleTime: 30_000,
  });

  return {
    marketDetails: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

const MARKET_SUMMARY_STALE_MS = 5 * 60 * 1000; // 5 min - avoid refetching same market

export function useMarketSummary(marketTitle: string | null, marketData: any = null) {
  const cacheId = getMarketCacheId(marketData);
  const query = useQuery({
    queryKey: ["market-summary", marketTitle ?? "", cacheId],
    queryFn: async () => {
      const res = await fetch("/api/kalshi/market-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketTitle, marketData }),
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      const data = await res.json();
      return data.summary || "";
    },
    enabled: !!marketTitle && !!cacheId,
    staleTime: MARKET_SUMMARY_STALE_MS,
    gcTime: MARKET_SUMMARY_STALE_MS * 2,
  });

  return {
    summary: query.data ?? "",
    isGenerating: query.isFetching,
    error: query.error ? (query.error as Error).message : null,
  };
}

const MARKET_INSIGHTS_STALE_MS = 5 * 60 * 1000; // 5 min - avoid refetching same market

export function useMarketInsights(
  marketTitle: string | null,
  outcomes: MarketOutcome[] | null,
  marketDetails: MarketDetails | null = null
) {
  const cacheId = getMarketCacheId(marketDetails);

  const query = useQuery({
    queryKey: ["market-insights", marketTitle ?? "", cacheId],
    queryFn: async () => {
      const openTime =
        marketDetails?.open_time || outcomes?.[0]?.open_time || null;
      const closeTime =
        marketDetails?.close_time || outcomes?.[0]?.close_time || null;
      const expirationTime =
        marketDetails?.expected_expiration_time ||
        outcomes?.[0]?.expected_expiration_time ||
        null;

      const res = await fetch("/api/kalshi/market-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketTitle,
          outcomes,
          openTime,
          closeTime,
          expirationTime,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate insights");
      const data = await res.json();
      return (data.insights || []) as string[];
    },
    enabled: !!marketTitle && !!cacheId && !!outcomes && outcomes.length > 0,
    staleTime: MARKET_INSIGHTS_STALE_MS,
    gcTime: MARKET_INSIGHTS_STALE_MS * 2,
  });

  return {
    insights: query.data ?? [],
    isGenerating: query.isFetching,
    error: query.error ? (query.error as Error).message : null,
  };
}
