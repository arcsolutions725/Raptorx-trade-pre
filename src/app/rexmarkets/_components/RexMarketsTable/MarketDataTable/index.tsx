/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
  useMemo,
  type UIEvent,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  useKalashiMarkets,
  type CategoryType,
} from "@/hooks/useKalashiMarkets";
import { usePolymarketMarkets } from "@/hooks/usePolymarketMarkets";
import { useLimitlessMarkets } from "@/hooks/useLimitlessMarkets";
import { useMyriadMarkets } from "@/hooks/useMyriadMarkets";
import { usePredictFunMarkets } from "@/hooks/usePredictFunMarkets";
import { usePredictFunNavigation } from "@/hooks/usePredictFunNavigation";
import {
  PREDICT_FUN_DEFAULT_CATEGORY_VALUE,
  predictFunLabelFromValue,
  predictFunTagIdFromLabel,
  predictFunTagIdFromValue,
} from "@/lib/predictfun/navigation";
import { sortLimitlessMarketsByVolumeDesc } from "@/lib/limitless/sortMarketsByVolume";
import { useLimitlessNavigation } from "@/hooks/useLimitlessNavigation";
import { useDataSource } from "@/contexts/DataSourceContext";
import TableHeader, { REX_TABLE_MIN_W } from "./TableHeader";
import TableRow from "./TableRow";
import MarketCategory from "./MarketCategory";
import RexMarketsSearch from "../RexMarketsSearch";
import RexMarketsCardView from "./RexMarketsCardView";
import {
  CardSkeleton,
  GridIcon,
  ListIcon,
  TableSkeleton,
} from "./listUi";
import RexPager from "./RexPager";
import Image from "next/image";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import {
  getRexmarketsDetailHref,
  getMarketReportGenKey,
} from "@/lib/rexmarkets/marketRoutes";
import PolymarketTradingInterface from "../../RexMarketsReport/RexMarketsReportData/PolymarketTradingInterface";

type MarketsLayoutView = "table" | "card";

/** Rows-per-page options each venue's list API accepts
    (Limitless rejects more than 25; Polymarket returns at most 100; Myriad rejects 200). */
const PAGE_SIZES: Record<string, readonly number[]> = {
  kalshi: [25, 50, 100, 200],
  polymarket: [25, 50, 100],
  limitless: [25],
  myriad: [25, 50, 100],
  predictfun: [25, 50],
  all: [25, 50, 100],
};
const DEFAULT_PAGE_SIZES: readonly number[] = [25, 50];
/** Shared with the prototype's other lists: the last "Show N per page" choice. */
const PAGE_SIZE_KEY = "rx-page-size";
/** Venues paged by page number / offset: any page opens directly. The rest page by cursor. */
const RANDOM_ACCESS_SOURCES = new Set(["polymarket", "limitless", "myriad"]);
/** Largest allowed size that does not exceed the preferred one. */
const fitPageSize = (sizes: readonly number[], preferred: number) =>
  [...sizes].reverse().find((s) => s <= preferred) ?? sizes[0];

// Category mapping - extracted outside component to prevent recreation
// Maps categories to CategoryType for Kalshi API compatibility
// Categories not in this map will be passed through as-is (for categories like "companies", "health", etc.)
const CATEGORY_MAP: Record<string, CategoryType> = {
  crypto: "crypto",
  politics: "politics",
  sports: "sports",
  finance: "finance",
  financials: "finance",
  economics: "economics",
  climate: "climate",
  "climate and weather": "climate",
  entertainment: "entertainment",
  // Note: "companies", "health", "science and technology", "transportation", "world" 
  // are valid Kalshi categories but not in CategoryType enum, so they pass through
  Crypto: "crypto",
  Politics: "politics",
  Sports: "sports",
  Finance: "finance",
  Financials: "finance",
  Economics: "economics",
  Climate: "climate",
  "Climate and Weather": "climate",
  Entertainment: "entertainment",
};

const normalizeCategory = (cat: string): string => {
  return cat.toLowerCase().trim();
};

const mapCategoryToType = (category: string | null): CategoryType | string => {
  if (!category) return "all";
  const normalized = normalizeCategory(category);
  // If category is in the map, return the mapped value
  const mapped = CATEGORY_MAP[category] || CATEGORY_MAP[normalized];
  if (mapped) return mapped;
  // Otherwise, return the normalized category as-is (for categories like "companies")
  return normalized;
};

type MarketDataTableProps = {
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
  searchQuery?: string | null;
  onSearchChange?: (query: string | null) => void;
  onMarketSelected?: (
    eventTicker: string,
    marketTitle: string,
    totalVolume: number,
    eventId?: string,
    marketSource?: string
  ) => void;
};

export default function MarketDataTable({
  onReportGenerated,
  currentUserId,
  searchQuery,
  onSearchChange,
  onMarketSelected,
}: MarketDataTableProps) {
  const router = useRouter();
  // State for chart view (similar to crypto side)
  const [selectedForChart, setSelectedForChart] = useState<{
    eventTicker: string;
    marketTitle: string;
    totalVolume: number;
    eventId?: string;
  } | null>(null);
  const { dataSource } = useDataSource();
  const isAllMode = dataSource === "all";
  const [category, setCategory] = useState<CategoryType | string>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [originalCategoryName, setOriginalCategoryName] = useState<
    string | null
  >(null);
  // Cards first, like design/predictions.html; the viewer's choice is remembered (same key as the prototype)
  const [layoutView, setLayoutViewState] = useState<MarketsLayoutView>("card");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rx-pm-view");
      if (saved === "table") setLayoutViewState("table");
    } catch {
      /* storage blocked: keep cards */
    }
  }, []);
  const setLayoutView = useCallback((view: MarketsLayoutView) => {
    setLayoutViewState(view);
    try {
      window.localStorage.setItem("rx-pm-view", view === "table" ? "table" : "cards");
    } catch {
      /* ignore */
    }
  }, []);

  // Extract source and tag from tag string in "all" mode
  const { kalshiTag, polymarketTag, limitlessTag, kalshiCategory, polymarketCategory, limitlessCategory } = useMemo(() => {
    if (!isAllMode) {
      return {
        kalshiTag: tag,
        polymarketTag: tag,
        limitlessTag: tag,
        kalshiCategory: originalCategoryName || category,
        polymarketCategory: originalCategoryName || category,
        limitlessCategory: originalCategoryName || category,
      };
    }
    
    // In "all" mode, tags are prefixed with source
    if (tag && tag.includes(":")) {
      const [source, tagValue] = tag.split(":", 2);
      if (source === "kalshi") {
        // Map category for Kalshi
        const catForKalshi = originalCategoryName 
          ? mapCategoryToType(originalCategoryName)
          : category;
        return {
          kalshiTag: tagValue,
          polymarketTag: null,
          limitlessTag: null,
          kalshiCategory: catForKalshi,
          polymarketCategory: null,
          limitlessCategory: null,
        };
      } else if (source === "polymarket") {
        // For Polymarket, use the normalized category name directly
        return {
          kalshiTag: null,
          polymarketTag: tagValue,
          limitlessTag: null,
          kalshiCategory: null,
          polymarketCategory: originalCategoryName || null,
          limitlessCategory: null,
        };
      } else if (source === "limitless") {
        // For Limitless, use the normalized category name directly
        return {
          kalshiTag: null,
          polymarketTag: null,
          limitlessTag: tagValue,
          kalshiCategory: null,
          polymarketCategory: null,
          limitlessCategory: originalCategoryName || null,
        };
      }
    }
    
    // If no tag, use category for all sources
    // Map category for Kalshi, use normalized name for Polymarket and Limitless
    const normalizedCat = originalCategoryName?.toLowerCase().trim() || null;
    const catForKalshi = normalizedCat 
      ? mapCategoryToType(normalizedCat)
      : category;
    // For Polymarket and Limitless, use the normalized category name as slug
    const catForPolymarket = normalizedCat || null;
    const catForLimitless = normalizedCat || null;
    
    return {
      kalshiTag: null,
      polymarketTag: null,
      limitlessTag: null,
      kalshiCategory: catForKalshi,
      polymarketCategory: catForPolymarket,
      limitlessCategory: catForLimitless,
    };
  }, [isAllMode, tag, originalCategoryName, category]);

  // Kalshi markets hook - enabled when dataSource is "kalshi" or "all"
  const kalshiMarkets = useKalashiMarkets(
    (kalshiCategory ?? undefined) as CategoryType | string,
    kalshiTag ?? undefined,
    searchQuery ?? undefined,
    dataSource === "kalshi" || dataSource === "all"
  );

  // Polymarket markets hook - enabled when dataSource is "polymarket" or "all"
  const polymarketMarkets = usePolymarketMarkets(
    polymarketCategory ?? undefined,
    polymarketTag ?? undefined,
    searchQuery ?? undefined,
    dataSource === "polymarket" || dataSource === "all"
  );

  // Limitless: resolve category slug -> category id for market-pages API
  const { slugToId } = useLimitlessNavigation(
    dataSource === "limitless" || dataSource === "all"
  );
  const limitlessCategoryId = useMemo(() => {
    if (!limitlessCategory) return null;
    return slugToId[limitlessCategory] ?? null;
  }, [limitlessCategory, slugToId]);

  // Limitless tag filter: tag is "paramKey:paramValue" (e.g. duration:hourly)
  const limitlessTagFilter = useMemo((): Record<string, string> | null => {
    const isLimitless = dataSource === "limitless" || dataSource === "all";
    if (!isLimitless || !limitlessTag || !limitlessTag.includes(":")) return null;
    const idx = limitlessTag.indexOf(":");
    const key = limitlessTag.slice(0, idx).trim();
    const value = limitlessTag.slice(idx + 1).trim();
    return key && value ? { [key]: value } : null;
  }, [dataSource, limitlessTag]);

  // Limitless markets hook - uses category id and optional tag filter
  const limitlessMarkets = useLimitlessMarkets(
    limitlessCategoryId ?? undefined,
    limitlessTagFilter ?? undefined,
    searchQuery ?? undefined,
    dataSource === "limitless" || dataSource === "all"
  );

  const myriadTopic =
    dataSource === "myriad" ? (originalCategoryName ?? undefined) : undefined;

  const myriadMarkets = useMyriadMarkets(
    myriadTopic ?? null,
    searchQuery ?? null,
    dataSource === "myriad"
  );

  const { nameToTagId: predictFunNameToTagId } = usePredictFunNavigation(
    dataSource === "predictfun"
  );

  const predictfunTagId = useMemo(() => {
    if (dataSource !== "predictfun") return null;

    // Sub-tag under a category (e.g. NBA under Sports)
    const fromSubTag =
      predictFunTagIdFromValue(tag) ??
      predictFunTagIdFromLabel(tag) ??
      (tag ? predictFunNameToTagId[tag.toLowerCase().trim()] : undefined);
    if (fromSubTag) return fromSubTag;

    // Primary category tab (e.g. predictfun:4 → Sports → GET /categories?tagIds=4)
    return (
      predictFunTagIdFromValue(originalCategoryName) ??
      predictFunTagIdFromLabel(
        predictFunLabelFromValue(originalCategoryName) ?? originalCategoryName
      ) ??
      (originalCategoryName
        ? predictFunNameToTagId[originalCategoryName.toLowerCase().trim()]
        : null)
    );
  }, [dataSource, tag, originalCategoryName, predictFunNameToTagId]);

  const predictFunMarkets = usePredictFunMarkets(
    predictfunTagId,
    searchQuery ?? null,
    dataSource === "predictfun"
  );

  // Merge markets when in "all" mode, or add source identifier when in single-source mode
  const mergedMarkets = useMemo(() => {
    if (!isAllMode) {
      // Add source identifier even in single-source mode for proper routing
      if (dataSource === "polymarket") {
        return polymarketMarkets.markets.map((market: any) => ({
          ...market,
          _source: "polymarket" as const,
        }));
      } else if (dataSource === "limitless") {
        return sortLimitlessMarketsByVolumeDesc(
          limitlessMarkets.markets.map((market: any) => ({
            ...market,
            _source: "limitless" as const,
          })),
        );
      } else if (dataSource === "myriad") {
        return myriadMarkets.markets.map((market: any) => ({
          ...market,
          _source: "myriad" as const,
        }));
      } else if (dataSource === "predictfun") {
        return predictFunMarkets.markets.map((market: any) => ({
          ...market,
          _source: "predictfun" as const,
        }));
      } else {
        // dataSource === "kalshi"
        return kalshiMarkets.markets.map((market: any) => ({
          ...market,
          _source: "kalshi" as const,
        }));
      }
    }
    
    // Combine markets from all sources and add source identifier
    const kalshiMarketsWithSource = kalshiMarkets.markets.map((market: any) => ({
      ...market,
      _source: "kalshi" as const,
    }));
    
    const polymarketMarketsWithSource = polymarketMarkets.markets.map((market: any) => ({
      ...market,
      _source: "polymarket" as const,
    }));
    
    const limitlessMarketsWithSource = sortLimitlessMarketsByVolumeDesc(
      limitlessMarkets.markets.map((market: any) => ({
        ...market,
        _source: "limitless" as const,
      })),
    );

    // Sort by volume (24h) descending — coerce to number for correct ordering
    const combined = [...kalshiMarketsWithSource, ...polymarketMarketsWithSource, ...limitlessMarketsWithSource];
    combined.sort((a, b) => {
      const volumeA = Number(a.volume_24h ?? a.volume24hr ?? a.volume ?? 0);
      const volumeB = Number(b.volume_24h ?? b.volume24hr ?? b.volume ?? 0);
      return volumeB - volumeA;
    });
    
    return combined;
  }, [
    isAllMode,
    dataSource,
    kalshiMarkets.markets,
    polymarketMarkets.markets,
    limitlessMarkets.markets,
    myriadMarkets.markets,
    predictFunMarkets.markets,
  ]);

  const allModePageIndex = Math.max(
    kalshiMarkets.pageIndex,
    polymarketMarkets.pageIndex,
    limitlessMarkets.pageIndex,
  );

  // Select the appropriate data source
  const {
    markets,
    isLoading,
    isError,
    refetch,
    isFetching,
    pageIndex,
    pageSize,
    totalPages,
    hasPrev,
    hasNext,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,
    isPageLoading,
  } = isAllMode
    ? {
        markets: mergedMarkets,
        isLoading:
          kalshiMarkets.isLoading ||
          polymarketMarkets.isLoading ||
          limitlessMarkets.isLoading,
        isError:
          kalshiMarkets.isError ||
          polymarketMarkets.isError ||
          limitlessMarkets.isError,
        refetch: async () => {
          await Promise.all([
            kalshiMarkets.refetch(),
            polymarketMarkets.refetch(),
            limitlessMarkets.refetch(),
          ]);
        },
        isFetching:
          kalshiMarkets.isFetching ||
          polymarketMarkets.isFetching ||
          limitlessMarkets.isFetching,
        pageIndex: allModePageIndex,
        pageSize: Math.max(kalshiMarkets.pageSize, polymarketMarkets.pageSize, limitlessMarkets.pageSize),
        totalPages: undefined, // Combined pagination is complex, so we'll handle it differently
        hasPrev: allModePageIndex > 1,
        hasNext: mergedMarkets.length >= Math.max(kalshiMarkets.pageSize, polymarketMarkets.pageSize, limitlessMarkets.pageSize),
        nextPage: () => {
          // In "all" mode, we'll load more by fetching next pages from all sources
          kalshiMarkets.nextPage();
          polymarketMarkets.nextPage();
          limitlessMarkets.nextPage();
        },
        prevPage: () => {
          kalshiMarkets.prevPage();
          polymarketMarkets.prevPage();
          limitlessMarkets.prevPage();
        },
        setPageIndex: (idx: number) => {
          kalshiMarkets.setPageIndex(idx);
          polymarketMarkets.setPageIndex(idx);
          limitlessMarkets.setPageIndex(idx);
        },
        // Each venue gets the largest size its API accepts (see PAGE_SIZES)
        setPageSize: (size: number) => {
          kalshiMarkets.setPageSize(size);
          polymarketMarkets.setPageSize(Math.min(size, 100));
          limitlessMarkets.setPageSize(Math.min(size, 25));
        },
        isPageLoading: kalshiMarkets.isPageLoading || polymarketMarkets.isPageLoading || limitlessMarkets.isPageLoading,
      }
    : dataSource === "polymarket"
    ? { ...polymarketMarkets, markets: mergedMarkets }
    : dataSource === "limitless"
    ? { ...limitlessMarkets, markets: mergedMarkets }
    : dataSource === "myriad"
    ? { ...myriadMarkets, markets: mergedMarkets }
    : dataSource === "predictfun"
    ? { ...predictFunMarkets, markets: mergedMarkets }
    : { ...kalshiMarkets, markets: mergedMarkets };

  // Reset category and page when data source changes (but not when switching to/from "all")
  useEffect(() => {
    if (dataSource !== "all") {
      setCategory("all");
      setOriginalCategoryName(
        dataSource === "myriad"
          ? "all"
          : dataSource === "predictfun"
            ? PREDICT_FUN_DEFAULT_CATEGORY_VALUE
            : null
      );
      setTag(null);
      setPageIndex(1);
    }
  }, [dataSource, setPageIndex]);

  // Entering "All" starts the merged list on page 1 (the venue hooks keep their page from single-venue browsing)
  const { setPageIndex: setKalshiPage } = kalshiMarkets;
  const { setPageIndex: setPolymarketPage } = polymarketMarkets;
  const { setPageIndex: setLimitlessPage } = limitlessMarkets;
  useEffect(() => {
    if (dataSource !== "all") return;
    setKalshiPage(1);
    setPolymarketPage(1);
    setLimitlessPage(1);
  }, [dataSource, setKalshiPage, setPolymarketPage, setLimitlessPage]);

  // Rows per page: the viewer's last choice (kept across visits), fitted to what each venue's API accepts
  const pageSizes = PAGE_SIZES[dataSource] ?? DEFAULT_PAGE_SIZES;
  const [preferredPageSize, setPreferredPageSize] = useState(pageSizes[0]);
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
      if (saved > 0) setPreferredPageSize(saved);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  const effectivePageSize = fitPageSize(pageSizes, preferredPageSize);
  const pageSizeOutOfStep = isAllMode
    ? kalshiMarkets.pageSize !== effectivePageSize ||
      polymarketMarkets.pageSize !== Math.min(effectivePageSize, 100) ||
      limitlessMarkets.pageSize !== Math.min(effectivePageSize, 25)
    : pageSize !== effectivePageSize;
  useEffect(() => {
    if (!pageSizeOutOfStep) return;
    setPageSize(effectivePageSize);
    setPageIndex(1);
    // setPageSize / setPageIndex change identity every render in "all" mode; the guard stops repeats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSizeOutOfStep, effectivePageSize, dataSource]);

  // --- Refs for scroll synchronization
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  /** Horizontal scroll layer (table view); same pattern as RexScreener for iOS */
  const horizScrollRef = useRef<HTMLDivElement | null>(null);
  const headerContentRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // --- State
  const [ghostWidth, setGhostWidth] = useState(1);
  const [ready, setReady] = useState(false); // when true, allow top bar interaction
  const syncHeaderScrollPosition = useCallback((left: number) => {
    if (!headerContentRef.current) return;
    headerContentRef.current.style.transform = `translateX(-${left}px)`;
    // TableHeader counter-translates its pinned "Market" cell by this amount
    headerContentRef.current.style.setProperty("--rx-hx", `${left}px`);
  }, []);

  // prevent scroll feedback loops
  const syncingFrom = useRef<"top" | "horiz" | null>(null);

  // ---- Measuring ----
  const measure = useCallback(() => {
    const content = contentRef.current;
    const main = mainScrollRef.current;
    const horiz = horizScrollRef.current;
    if (!content || !main || !horiz) return;

    const widths = [
      content.scrollWidth,
      content.clientWidth,
      content.offsetWidth,
      horiz.scrollWidth,
      horiz.clientWidth,
      main.clientWidth,
    ].map((n) => (typeof n === "number" ? n : 0));
    const width = Math.max(...widths, 1);

    setGhostWidth(width);

    if (topScrollRef.current && layoutView === "table") {
      topScrollRef.current.scrollLeft = horiz.scrollLeft;
    }
    syncHeaderScrollPosition(horiz.scrollLeft);
  }, [layoutView, syncHeaderScrollPosition]);

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets.length, pageSize, pageIndex, layoutView]);

  const deferredMeasure = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measure();
        setReady(true);
      });
    });
  }, [measure]);

  useEffect(() => {
    const fontsReady = (document as any)?.fonts?.ready;
    if (fontsReady?.then) {
      fontsReady.then(deferredMeasure);
    }
  }, [deferredMeasure]);

  useEffect(() => {
    setReady(false);
    deferredMeasure();
    const t = setTimeout(deferredMeasure, 60);
    return () => clearTimeout(t);
  }, [markets, deferredMeasure]);

  useEffect(() => {
    const onResize = () => deferredMeasure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [deferredMeasure]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => deferredMeasure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [deferredMeasure]);

  const onTopScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (syncingFrom.current === "horiz") {
      syncingFrom.current = null;
      return;
    }
    const top = e.currentTarget;
    const horiz = horizScrollRef.current;
    if (!horiz) return;

    syncingFrom.current = "top";
    horiz.scrollLeft = top.scrollLeft;
    syncHeaderScrollPosition(top.scrollLeft);
    requestAnimationFrame(() => {
      if (syncingFrom.current === "top") syncingFrom.current = null;
    });
  }, []);

  const onHorizScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (layoutView !== "table") return;
    if (syncingFrom.current === "top") {
      syncingFrom.current = null;
      return;
    }
    const horiz = e.currentTarget;
    const top = topScrollRef.current;
    if (!top) return;

    syncingFrom.current = "horiz";
    top.scrollLeft = horiz.scrollLeft;
    syncHeaderScrollPosition(horiz.scrollLeft);
    requestAnimationFrame(() => {
      if (syncingFrom.current === "horiz") syncingFrom.current = null;
    });
  }, [layoutView]);

  const handleCategoryChange = useCallback(
    (newCategory: string | null) => {
      if (dataSource === "predictfun") {
        setOriginalCategoryName(
          newCategory && newCategory !== "all"
            ? newCategory
            : PREDICT_FUN_DEFAULT_CATEGORY_VALUE
        );
        setCategory("all");
        setTag(null);
        setPageIndex(1);
        return;
      }

      if (!newCategory) {
        setOriginalCategoryName(null);
        setCategory("all");
        setPageIndex(1);
        return;
      }

      // In "all" mode, keep the normalized category name for Polymarket
      // but also map it for Kalshi
      if (isAllMode) {
        const normalizedCategory = newCategory.toLowerCase().trim();
        setOriginalCategoryName(normalizedCategory);
        // Map to CategoryType for Kalshi compatibility
        const mappedCategory = mapCategoryToType(normalizedCategory);
        setCategory(mappedCategory);
      } else {
        const mappedCategory = mapCategoryToType(newCategory);
        setOriginalCategoryName(newCategory);
        setCategory(mappedCategory);
      }
      setPageIndex(1);
    },
    [setPageIndex, isAllMode, dataSource]
  );

  const handleTagChange = useCallback(
    (newTag: string | null) => {
      setTag(newTag);
      setPageIndex(1);
    },
    [setPageIndex]
  );

  const handleMarketClick = useCallback(
    (m: {
      event_ticker?: string;
      ticker?: string;
      slug?: string;
      id?: string;
      title: string;
      volume?: number;
      volume24hr?: number;
      _source?: "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";
    }) => {
      const href = getRexmarketsDetailHref(m as any, dataSource);
      if (href) {
        router.push(href);
        return;
      }
      const ticker = getMarketReportGenKey(m as any);
      const volume = m.volume || m.volume24hr || 0;
      const eventId = m.id != null ? String(m.id) : undefined;
      if (onMarketSelected) {
        onMarketSelected(ticker, m.title, volume, eventId, m._source);
      }
    },
    [onMarketSelected, dataSource, router]
  );

  // Handle market selection from URL parameters (e.g., from MarketInfoModal)
  // Redirect to new route structure for Polymarket and Kalshi markets
  const searchParams = useSearchParams();
  useEffect(() => {
    const eventTicker = searchParams.get("event_ticker");
    const marketTitle = searchParams.get("market_title");
    const source = searchParams.get("source");
    const eventId = searchParams.get("event_id");
    
    if (eventTicker && source === "polymarket") {
      // Redirect Polymarket markets to new route structure
      router.replace(`/rexmarkets/polymarket/${eventTicker}`);
      return;
    }
    
    if (eventTicker && source === "kalshi") {
      // Redirect Kalshi markets to new route structure
      router.replace(`/rexmarkets/kalshi/${eventTicker}`);
      return;
    }
    
    if (eventTicker && source === "limitless") {
      // Redirect Limitless markets to new route structure
      router.replace(`/rexmarkets/limitless/${eventTicker}`);
      return;
    }
    
    // For non-Polymarket, non-Kalshi, and non-Limitless markets, handle normally
    if (eventTicker && marketTitle && source !== "polymarket" && source !== "kalshi" && source !== "limitless") {
      // Check if URL params represent a different market than currently selected
      const isDifferentMarket = selectedForChart 
        ? (selectedForChart.eventTicker !== eventTicker || 
           selectedForChart.eventId !== (eventId || undefined))
        : true; // If no market selected, always process
      
      if (isDifferentMarket) {
        // Process if we have the required params and it's a different market
        handleMarketClick({
          event_ticker: eventTicker,
          ticker: eventTicker,
          id: eventId || undefined,
          title: marketTitle,
          volume: 0,
          volume24hr: 0,
          _source: undefined as "polymarket" | "kalshi" | undefined,
        });
        
        // Clear URL params after processing
        const url = new URL(window.location.href);
        url.searchParams.delete("event_ticker");
        url.searchParams.delete("market_title");
        url.searchParams.delete("source");
        url.searchParams.delete("event_id");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    }
  }, [searchParams, handleMarketClick, selectedForChart, router]);

  const handleBackFromChart = useCallback(() => {
    setSelectedForChart(null);
  }, []);

  /** After paging, bring the list back to its first row (prototype: scroll #main into view). */
  const scrollListToTop = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Next/Previous go through the hooks' own steppers (cursor venues record the next cursor there)
  const handlePageChange = (n: number) => {
    if (n === pageIndex + 1) nextPage();
    else if (n === pageIndex - 1) prevPage();
    else setPageIndex(n);
    scrollListToTop();
  };

  const handlePageSizeChange = useCallback(
    (n: number) => {
      setPreferredPageSize(n);
      try {
        window.localStorage.setItem(PAGE_SIZE_KEY, String(n));
      } catch {
        /* storage unavailable: the choice lasts for this visit */
      }
      scrollListToTop();
    },
    [scrollListToTop]
  );

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  // If a Polymarket market is selected, show Trading View instead of table
  if (selectedForChart) {
    return (
      <PolymarketTradingInterface
        eventTicker={selectedForChart.eventTicker}
        marketTitle={selectedForChart.marketTitle}
        totalVolume={selectedForChart.totalVolume}
        eventId={selectedForChart.eventId}
        onBack={handleBackFromChart}
        onReportGenerated={onReportGenerated}
        userId={currentUserId}
      />
    );
  }

  const isTable = layoutView === "table";

  // Refetch overlay: Kalshi on pagination and category changes; the other venues only when
  // fetching after a category change (not pagination)
  const showRefetchOverlay =
    (dataSource === "kalshi" && (isPageLoading || (isFetching && markets.length > 0))) ||
    ((dataSource === "polymarket" ||
      dataSource === "limitless" ||
      dataSource === "myriad" ||
      dataSource === "predictfun") &&
      isFetching &&
      markets.length > 0 &&
      !isPageLoading);

  const showSkeleton = isLoading && !isError && markets.length === 0;
  const showEmpty = !isLoading && !isError && markets.length === 0;
  const showMarkets = !isLoading && !isError && markets.length > 0;

  // Pager under the last row; hidden when everything fits on one page (an empty later page keeps it, to go back)
  const showPageSizePicker =
    pageSizes.length > 1 && (hasNext || hasPrev || markets.length > pageSizes[0]);
  const showPager =
    (showMarkets || (showEmpty && hasPrev)) &&
    (hasPrev || hasNext || (totalPages ?? 1) > 1 || showPageSizePicker);

  const layoutToggle = (
    <div className="rx-seg shrink-0" role="group" aria-label="Markets layout">
      <button
        type="button"
        onClick={() => setLayoutView("card")}
        aria-label="Card view"
        aria-pressed={layoutView === "card"}
        title="Card view"
        className={clsx("rx-seg__item px-2.5", layoutView === "card" && "is-active")}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        onClick={() => setLayoutView("table")}
        aria-label="Table view"
        aria-pressed={isTable}
        title="Table view"
        className={clsx("rx-seg__item px-2.5", isTable && "is-active")}
      >
        <ListIcon />
      </button>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col overflow-hidden min-h-0">
      {/* Bar: categories · search · layout (one row on desktop; search + layout first on phones) */}
      <div className="flex-shrink-0 px-3 pt-4 sm:px-5 sm:pt-5">
        <MarketCategory
          onCategoryChange={handleCategoryChange}
          onTagChange={handleTagChange}
          selectedCategory={originalCategoryName}
          selectedTag={tag}
          toolbarEnd={
            <>
              <div className="min-w-0 flex-1 md:w-[300px] md:flex-none">
                <RexMarketsSearch
                  onSearch={onSearchChange}
                  searchQuery={searchQuery}
                />
              </div>
              {layoutToggle}
              {/* Rex Pilot (report history, reports): the page title that held this button is gone (design/predictions.html) */}
              <button
                type="button"
                onClick={() => requestShellAction("pilot")}
                className="rx-btn rx-btn--claw size-10 shrink-0 justify-center rounded-xl p-0"
                aria-label="Claw AI 5.0: open Rex Pilot"
                title="Claw AI 5.0"
              >
                <Image
                  src="/images/claw-logo-96.webp"
                  alt=""
                  width={22}
                  height={22}
                  className="claw-ico"
                />
              </button>
            </>
          }
        />
      </div>

      <div className="flex-1 min-h-0 relative flex flex-col">
        {showRefetchOverlay ? (
          <div className="pointer-events-none absolute inset-0 z-[45] flex items-center justify-center bg-[rgba(7,7,7,.45)]">
            <span
              className="rx-spin size-8 border-[3px] text-rx-gold"
              role="status"
              aria-label="Loading page"
            />
          </div>
        ) : null}

        {isError && (
          <div className="pointer-events-none absolute inset-0 z-[45] flex items-center justify-center px-4">
            <div
              className="rx-raised pointer-events-auto flex flex-col items-center gap-3 px-6 py-5 text-center"
              role="alert"
            >
              <p className="m-0 text-[14px] font-semibold text-rx-text">
                Failed to load.
              </p>
              <p className="rx-small m-0">
                The market list could not be loaded. Try again in a moment.
              </p>
              <button
                type="button"
                onClick={handleRefetch}
                className="rx-btn rx-btn--secondary rx-btn--s"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Desktop: synced horizontal scrollbar (table only); hidden on phones like RexScreener */}
        {isTable ? (
          <div
            ref={topScrollRef}
            className={clsx(
              "custom-hscroll-top z-10 hidden shrink-0 overflow-x-scroll overflow-y-hidden bg-black/0 lg:mx-5 lg:block lg:h-[16px]",
              ready ? null : "pointer-events-none opacity-80"
            )}
            onScroll={onTopScroll}
            aria-hidden="true"
            style={{
              scrollbarGutter: "stable both-edges" as any,
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              touchAction: "pan-x",
            }}
          >
            <div style={{ width: ghostWidth, height: 1 }} />
          </div>
        ) : null}

        {/* Vertical outer + horizontal inner (table); single column scroll (card).
            Table: inset to the page gutter on sm+, flush on phones (first column pinned). */}
        <div
          ref={mainScrollRef}
          className={clsx(
            "relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden hide-vert-scroll touch-manipulation",
            // same ground as the pinned first column, so the pin never reads as a separate block
            isTable && "bg-[#0C0C0C] sm:mx-5"
          )}
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorY: "contain",
          }}
          aria-busy={showSkeleton || showRefetchOverlay || undefined}
        >
          {isTable ? (
            <div className="sticky top-0 z-40 overflow-hidden bg-[#0C0C0C]">
              <div
                ref={headerContentRef}
                className="will-change-transform"
                style={{
                  width: ghostWidth,
                  transform: "translateX(0px)",
                }}
              >
                <TableHeader showSourceColumn={false} />
              </div>
            </div>
          ) : null}

          <div
            ref={horizScrollRef}
            className={clsx(
              "min-w-0 w-full overflow-y-visible",
              isTable
                ? "hide-bottom-hscroll overflow-x-auto"
                : "hide-bottom-hscroll overflow-x-hidden"
            )}
            onScroll={isTable ? onHorizScroll : undefined}
            style={{
              WebkitOverflowScrolling: "touch",
              ...(isTable
                ? { overscrollBehaviorX: "contain" as const }
                : {}),
            }}
          >
            <div
              ref={contentRef}
              className={clsx(
                "align-top w-full",
                !isTable && "px-3 pt-4 sm:px-5",
                !isTable && !showPager && "pb-6"
              )}
            >
              {showSkeleton && (
                <>
                  <span className="sr-only" role="status">
                    Loading markets...
                  </span>
                  {isTable ? <TableSkeleton /> : <CardSkeleton />}
                </>
              )}

              {showEmpty && (
                <p className="rx-small m-0 px-4 py-12 text-center">
                  No markets found. Try another category or clear the search.
                </p>
              )}

              {showMarkets &&
                (isTable ? (
                  <div className={clsx("w-full", REX_TABLE_MIN_W)}>
                    {markets.map((market, i) => (
                      <TableRow
                        key={`${market._source || dataSource}-${market.ticker || market.id}`}
                        market={market}
                        onMarketClick={handleMarketClick}
                        onMarketSelected={onMarketSelected}
                        onReportGenerated={onReportGenerated}
                        currentUserId={currentUserId}
                        index={i}
                        showSourceColumn={false}
                        showSourceLogo={isAllMode}
                      />
                    ))}
                  </div>
                ) : (
                  <RexMarketsCardView
                    markets={markets as any}
                    onMarketClick={handleMarketClick as any}
                    onMarketSelected={onMarketSelected}
                    onReportGenerated={onReportGenerated}
                    currentUserId={currentUserId}
                  />
                ))}
            </div>
          </div>

          {/* Pager: in flow under the last row, like the prototype (never scrolls sideways with the table) */}
          {showPager ? (
            <div className={clsx("pb-6 pt-4", isTable ? "px-3 sm:px-0" : "px-3 sm:px-5")}>
              <RexPager
                page={pageIndex}
                totalPages={totalPages}
                hasPrev={hasPrev}
                hasNext={hasNext}
                randomAccess={RANDOM_ACCESS_SOURCES.has(dataSource)}
                onPage={handlePageChange}
                size={effectivePageSize}
                sizes={pageSizes}
                onSize={handlePageSizeChange}
                showSize={showPageSizePicker}
                busy={!RANDOM_ACCESS_SOURCES.has(dataSource) && isFetching}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
