/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
  useMemo,
  memo,
  type UIEvent,
  type ChangeEvent,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  useKalashiMarkets,
  type CategoryType,
} from "@/hooks/useKalashiMarkets";
import { usePolymarketMarkets } from "@/hooks/usePolymarketMarkets";
import { useLimitlessMarkets } from "@/hooks/useLimitlessMarkets";
import { useLimitlessNavigation } from "@/hooks/useLimitlessNavigation";
import { useDataSource } from "@/contexts/DataSourceContext";
import TableHeader from "./TableHeader";
import TableRow from "./TableRow";
import MarketCategory from "./MarketCategory";
import PageLoaderOverlay from "@/components/PageLoaderOverlay";
import RexMarketsSearch from "../RexMarketsSearch";
import { useTopbar } from "@/contexts/TopbarContext";
import { Search, X } from "lucide-react";
import PolymarketTradingInterface from "../../RexMarketsReport/RexMarketsReportData/PolymarketTradingInterface";

type RowsPerPageSelectProps = {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
  className?: string;
};

const RowsPerPageSelect = memo(function RowsPerPageSelect({
  value,
  onChange,
  options = [25, 50],
  className = "",
}: RowsPerPageSelectProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const handleOptionClick = useCallback(
    (opt: number) => {
      onChange(opt);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div className={clsx("relative", className)}>
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center justify-between gap-2 w-[80px] sm:w-[112px] px-3 py-1.5 rounded-md border border-white/20 bg-black/30 hover:bg-white/10 transition text-white"
      >
        <span className="text-sm">{value}</span>
      </button>

      {open && (
        <ul className="absolute z-50 bottom-full mb-2 left-0 w-[160px] max-h-60 overflow-auto rounded-lg border border-white/15 bg-[#0A0A0A]/95 backdrop-blur shadow-2xl">
          {options.map((opt) => (
            <li
              key={opt}
              onClick={() => handleOptionClick(opt)}
              className={clsx(
                "flex items-center justify-between gap-3 cursor-pointer px-3 py-2 text-sm hover:bg-white/10",
                opt === value ? "text-[#FFD700]" : "text-white/90"
              )}
            >
              <span>{opt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

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
    eventId?: string
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
  const { isTopbarVisible } = useTopbar();
  const { dataSource } = useDataSource();
  const isAllMode = dataSource === "all";
  const [category, setCategory] = useState<CategoryType | string>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [originalCategoryName, setOriginalCategoryName] = useState<
    string | null
  >(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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
        return limitlessMarkets.markets.map((market: any) => ({
          ...market,
          _source: "limitless" as const,
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
    
    const limitlessMarketsWithSource = limitlessMarkets.markets.map((market: any) => ({
      ...market,
      _source: "limitless" as const,
    }));
    
    // Sort by volume (24h) descending
    const combined = [...kalshiMarketsWithSource, ...polymarketMarketsWithSource, ...limitlessMarketsWithSource];
    combined.sort((a, b) => {
      const volumeA = a.volume_24h || a.volume24hr || a.volume || 0;
      const volumeB = b.volume_24h || b.volume24hr || b.volume || 0;
      return volumeB - volumeA;
    });
    
    return combined;
  }, [isAllMode, dataSource, kalshiMarkets.markets, polymarketMarkets.markets, limitlessMarkets.markets]);

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
        isLoading: kalshiMarkets.isLoading || polymarketMarkets.isLoading || limitlessMarkets.isLoading,
        isError: kalshiMarkets.isError || polymarketMarkets.isError || limitlessMarkets.isError,
        refetch: async () => {
          await Promise.all([kalshiMarkets.refetch(), polymarketMarkets.refetch(), limitlessMarkets.refetch()]);
        },
        isFetching: kalshiMarkets.isFetching || polymarketMarkets.isFetching || limitlessMarkets.isFetching,
        pageIndex: Math.max(kalshiMarkets.pageIndex, polymarketMarkets.pageIndex, limitlessMarkets.pageIndex),
        pageSize: Math.max(kalshiMarkets.pageSize, polymarketMarkets.pageSize, limitlessMarkets.pageSize),
        totalPages: undefined, // Combined pagination is complex, so we'll handle it differently
        hasPrev: false, // Simplified for "all" mode
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
        setPageSize: (size: number) => {
          kalshiMarkets.setPageSize(size);
          polymarketMarkets.setPageSize(size);
          limitlessMarkets.setPageSize(size);
        },
        isPageLoading: kalshiMarkets.isPageLoading || polymarketMarkets.isPageLoading || limitlessMarkets.isPageLoading,
      }
    : dataSource === "polymarket"
    ? polymarketMarkets
    : dataSource === "limitless"
    ? limitlessMarkets
    : kalshiMarkets;

  // Reset category and page when data source changes (but not when switching to/from "all")
  useEffect(() => {
    if (dataSource !== "all") {
      setCategory("all");
      setOriginalCategoryName(null);
      setTag(null);
      setPageIndex(1);
    }
  }, [dataSource, setPageIndex]);

  const showCenteredOverlay = useMemo(
    () => (isLoading && markets.length === 0) || isError,
    [isLoading, markets.length, isError]
  );

  // --- Refs for scroll synchronization
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // --- State
  const [ghostWidth, setGhostWidth] = useState(1);
  const [ready, setReady] = useState(false); // when true, allow top bar interaction

  // prevent scroll feedback loops
  const syncingFrom = useRef<"top" | "main" | null>(null);

  // ---- Measuring ----
  const measure = useCallback(() => {
    const content = contentRef.current;
    const main = mainScrollRef.current;
    if (!content || !main) return;

    const widths = [
      content.scrollWidth,
      content.clientWidth,
      content.offsetWidth,
      main.scrollWidth,
      main.clientWidth,
      main.offsetWidth,
    ].map((n) => (typeof n === "number" ? n : 0));
    const width = Math.max(...widths, 1);

    setGhostWidth(width);

    if (topScrollRef.current && main) {
      topScrollRef.current.scrollLeft = main.scrollLeft;
    }
  }, []);

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets.length, pageSize, pageIndex]);

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
    if (syncingFrom.current === "main") {
      syncingFrom.current = null;
      return;
    }
    const top = e.currentTarget;
    const main = mainScrollRef.current;
    if (!main) return;

    syncingFrom.current = "top";
    main.scrollLeft = top.scrollLeft;
    requestAnimationFrame(() => {
      if (syncingFrom.current === "top") syncingFrom.current = null;
    });
  }, []);

  const onMainScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (syncingFrom.current === "top") {
      syncingFrom.current = null;
      return;
    }
    const main = e.currentTarget;
    const top = topScrollRef.current;
    if (!top) return;

    syncingFrom.current = "main";
    top.scrollLeft = (main as unknown as HTMLDivElement).scrollLeft;
    requestAnimationFrame(() => {
      if (syncingFrom.current === "main") syncingFrom.current = null;
    });
  }, []);

  const handleCategoryChange = useCallback(
    (newCategory: string | null) => {
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
    [setPageIndex, isAllMode]
  );

  const handleTagChange = useCallback(
    (newTag: string | null) => {
      setTag(newTag);
      setPageIndex(1);
    },
    [setPageIndex]
  );

  // Need to fix in here
  const handleMarketClick = useCallback(
    (m: { event_ticker?: string; ticker?: string; slug?: string; id?: string; title: string; volume?: number; volume24hr?: number; _source?: "kalshi" | "polymarket" | "limitless" }) => {
      const ticker = m.event_ticker || m.ticker || "";
      const slug = (m as any).slug || ""; // Polymarket and Limitless markets have slug field
      const volume = m.volume || m.volume24hr || 0;
      const eventId = m.id; // For Polymarket and Limitless markets, this is the event ID
      
      // Check market source
      const marketSource = m._source || dataSource;
      const isPolymarket = marketSource === "polymarket" || (dataSource === "all" && eventId && marketSource !== "limitless" && marketSource !== "kalshi");
      const isKalshi = marketSource === "kalshi" || (dataSource === "all" && !eventId && ticker && marketSource !== "limitless" && marketSource !== "polymarket");
      const isLimitless = marketSource === "limitless" || (dataSource === "all" && eventId && marketSource !== "polymarket" && marketSource !== "kalshi");
      
      if (isPolymarket && (slug || ticker)) {
        // For Polymarket: navigate to dedicated route using slug (preferred) or ticker as fallback
        const routeParam = slug || ticker;
        router.push(`/rexmarkets/polymarket/${routeParam}`);
      } else if (isKalshi && ticker) {
        // For Kalshi: navigate to dedicated route using event_ticker
        router.push(`/rexmarkets/kalshi/${ticker}`);
      } else if (isLimitless && (slug || ticker)) {
        // For Limitless: navigate to dedicated route using slug (preferred) or ticker as fallback
        const routeParam = slug || ticker;
        router.push(`/rexmarkets/limitless/${routeParam}`);
      } else {
        // Fallback: use original behavior (just open sidebar)
        if (onMarketSelected) {
          onMarketSelected(ticker, m.title, volume, eventId);
        }
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

  const handlePageIndexChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      if (!isNaN(value) && value > 0) {
        setPageIndex(value);
      }
    },
    [setPageIndex]
  );

  const handlePageSizeChange = useCallback(
    (n: number) => {
      setPageSize(Number(n));
    },
    [setPageSize]
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

  return (
    <div className="w-full h-full flex flex-col overflow-hidden pb-4">
      <div className="flex-shrink-0 mb-4 pt-3 px-3 sm:px-6">
        {/* Desktop: category + search side by side */}
        <div className="hidden sm:flex flex-col sm:flex-row items-start sm:items-start gap-4 sm:gap-6">
          <div className="w-full sm:flex-1 sm:min-w-0">
            <MarketCategory
              onCategoryChange={handleCategoryChange}
              onTagChange={handleTagChange}
              selectedCategory={originalCategoryName}
              selectedTag={tag}
            />
          </div>
          <div className="w-full sm:w-[300px] sm:flex-shrink-0">
            <RexMarketsSearch
              onSearch={onSearchChange}
              searchQuery={searchQuery}
            />
          </div>
        </div>

        {/* Mobile: search icon next to category tabs; tap to expand full search with close */}
        <div className="sm:hidden relative overflow-hidden min-h-[44px]">
          {/* Row 1: Category tabs + search icon (slides left when search expanded) - align icon with tabs row */}
          <div
            className={clsx(
              "flex items-start gap-2 transition-transform duration-300 ease-out",
              mobileSearchOpen ? "-translate-x-full" : "translate-x-0"
            )}
          >
            <div className="flex-1 min-w-0 overflow-hidden">
              <MarketCategory
                onCategoryChange={handleCategoryChange}
                onTagChange={handleTagChange}
                selectedCategory={originalCategoryName}
                selectedTag={tag}
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              className="flex-shrink-0 mt-1 rounded-xl text-white hover:text-white hover:bg-white/20 transition-colors h-10 w-10 flex items-center justify-center"
              aria-label="Open search"
            >
              <Search className="w-6 h-6" />
            </button>
          </div>

          {/* Row 2: Full-width search bar + close (slides in from right when open) */}
          <div
            className={clsx(
              "absolute top-0 left-0 right-0 flex items-center gap-2 transition-transform duration-300 ease-out min-h-[44px]",
              mobileSearchOpen ? "translate-x-0" : "translate-x-full"
            )}
          >
            <div className="flex-1 min-w-0">
              <RexMarketsSearch
                onSearch={onSearchChange}
                searchQuery={searchQuery}
              />
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl bg-white/12 text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              aria-label="Close search"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative flex flex-col h-[calc(100vh-450px)] sm:h-[calc(100vh-355px)]">
        {/* Show PageLoaderOverlay for Kalshi (pagination and category changes) */}
        {/* For Polymarket and Limitless, only show when fetching data after category change (not pagination) */}
        {(dataSource === "kalshi" && (isPageLoading || (isFetching && markets.length > 0))) ||
        ((dataSource === "polymarket" || dataSource === "limitless") && isFetching && markets.length > 0 && !isPageLoading) ? (
          <PageLoaderOverlay />
        ) : null}

        {showCenteredOverlay && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg shadow-2xl text-[#FFC000]">
              {isLoading && markets.length === 0 && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                  <span>Loading markets...</span>
                </div>
              )}
              {isError && (
                <div className="flex items-center">
                  <span className="text-[#FFC000]">Failed to load.</span>
                  <button
                    onClick={handleRefetch}
                    className="ml-3 underline hover:opacity-80 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Always-visible top scrollbar */}
        <div
          ref={topScrollRef}
          className={clsx(
            "sticky top-0 z-10 custom-hscroll-top bg-black/0 h-[16px] overflow-x-scroll overflow-y-hidden",
            ready ? null : "pointer-events-none opacity-80"
          )}
          onScroll={onTopScroll}
          aria-hidden="true"
          style={{ scrollbarGutter: "stable both-edges" as any }}
        >
          <div style={{ width: ghostWidth, height: 1 }} />
        </div>

        {/* Main scrollable table area */}
        <div
          ref={mainScrollRef}
          className="relative flex-1 overflow-y-auto overflow-x-auto hide-vert-scroll hide-bottom-hscroll"
          onScroll={onMainScroll}
        >
          <div ref={contentRef} className="align-top w-full">
            <TableHeader showSourceColumn={false} />

            {!isLoading && !isError && markets.length === 0 && (
              <div className="p-4 text-white/70">No markets found.</div>
            )}

            {!isLoading && !isError && markets.length > 0 && (
              <div className="divide-y divide-white/10 w-full">
                {markets.map((market, i) => (
                  <TableRow
                    key={`${market._source || dataSource}-${market.ticker || market.id}`}
                    market={market}
                    onMarketClick={handleMarketClick}
                    onReportGenerated={onReportGenerated}
                    currentUserId={currentUserId}
                    index={i}
                    showSourceColumn={false}
                    showSourceLogo={isAllMode}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`flex-shrink-0 flex flex-col gap-3 text-sm text-white/80 px-2 sm:px-4 pt-4 ${
        isTopbarVisible 
          ? "pb-[90px] sm:pb-[65px]"
          : "pb-[80px] sm:pb-[55px]"
      }`}>
        <div className="flex flex-col sm:justify-between sm:flex-row lg:items-center gap-3">
          <div className="flex flex-row justify-between sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <button
                className={clsx(
                  "px-3 py-1 rounded border border-white/20 text-sm",
                  hasPrev
                    ? "hover:bg-white/10"
                    : "opacity-40 cursor-not-allowed"
                )}
                onClick={prevPage}
                disabled={!hasPrev}
              >
                Prev
              </button>

              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-xs sm:text-sm">Page</span>

                <input
                  type="number"
                  min={1}
                  value={pageIndex}
                  onChange={handlePageIndexChange}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="1"
                  className="w-16 sm:w-20 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm rounded-md bg-black/30 border border-white/20 text-white placeholder-white/40 outline-none
                             focus:border-[#FFD700]/60 focus:ring-2 focus:ring-[#FFD700]/50 transition
                             [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />

                {totalPages ? (
                  <span className="text-white/60 text-xs sm:text-sm">
                    of {totalPages}
                  </span>
                ) : null}
              </div>

              <button
                className={clsx(
                  "px-3 py-1 rounded border border-white/20 text-sm",
                  hasNext
                    ? "hover:bg-white/10"
                    : "opacity-40 cursor-not-allowed"
                )}
                onClick={nextPage}
                disabled={!hasNext}
              >
                Next
              </button>
            </div>

            <label className="flex items-center gap-1 sm:gap-2">
              <RowsPerPageSelect
                value={pageSize}
                onChange={handlePageSizeChange}
                options={[25, 50]}
                className="sm:ml-1"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
