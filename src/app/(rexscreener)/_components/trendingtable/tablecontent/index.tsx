/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useTrendingTokens,
  sortTokens,
  type TrendingToken,
  type Chain,
} from "@/hooks/useTrendingTokens";
import {
  useTrendingSparklines,
  trendSparklineCacheKey,
} from "@/hooks/useTrendingSparklines";
import { TableHeader } from "./TableHeader";
import { TableRow } from "./TableRow";
import DexscreenerView from "./DexscreenerView";
import PageLoaderOverlay from "@/components/PageLoaderOverlay";
import { TokenSearchBar } from "@/app/(rexscreener)/_components/TokenSearchBar";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { ChainButtons } from "./ChainButtons";
import clsx from "clsx";
import { useGenerateRexReport } from "@/hooks/useGenerateRexReport";
import { goldenRegistryKeyFromTrendingToken } from "@/lib/goldenReportRegistryMatch";
import {
  hasUsableTokenCreatedAt,
  mergeScreenerTokenAges,
} from "@/utils/tokenAge";
import { applyScreenerRowRichCache } from "@/utils/screenerRowMerge";

/* ============================ Styled, Up-Opening Select ============================ */

type RowsPerPageSelectProps = {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
  className?: string;
  /** "up" by default; set "down" if you ever want normal dropdown behavior */
  direction?: "up" | "down";
};

function RowsPerPageSelect({
  value,
  onChange,
  options = [25, 50],
  className = "",
  direction = "up",
}: RowsPerPageSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    Math.max(
      0,
      options.findIndex((o) => o === value)
    )
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Ensure activeIndex follows current value
  useEffect(() => {
    const idx = options.findIndex((o) => o === value);
    if (idx >= 0) setActiveIndex(idx);
  }, [value, options]);

  const commit = (idx: number) => {
    const selected = options[idx];
    if (typeof selected === "number") onChange(selected);
    setOpen(false);
  };

  const onKeyDownButton = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => listRef.current?.focus());
    }
  };

  const onKeyDownList = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(activeIndex);
      return;
    }
  };

  const popPos = direction === "up" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDownButton}
        className="flex items-center justify-between gap-2 w-20 sm:w-28 px-3 py-1.5 rounded-md border border-white/20 bg-black/30 hover:bg-white/10 transition text-white"
      >
        <span className="text-sm">{value}</span>
        <ChevronDown
          className={`size-4 opacity-80 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`rpp-opt-${activeIndex}`}
          onKeyDown={onKeyDownList}
          className={`absolute z-50 ${popPos} left-0 w-40 max-h-60 overflow-auto rounded-lg border border-white/15 bg-[#0A0A0A]/95 backdrop-blur supports-backdrop-filter:bg-[#0A0A0A]/70 shadow-2xl`}
        >
          {options.map((opt, idx) => {
            const selected = opt === value;
            const active = idx === activeIndex;
            return (
              <li
                key={opt}
                id={`rpp-opt-${idx}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
                className={[
                  "flex items-center justify-between gap-3 cursor-pointer px-3 py-2 text-sm",
                  active ? "bg-white/10" : "bg-transparent",
                  selected ? "text-[#FFD700]" : "text-white/90",
                  "hover:bg-white/10",
                ].join(" ")}
              >
                <span>{opt}</span>
                {selected ? (
                  <Check className="size-4" />
                ) : (
                  <span className="size-4" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const GOLDEN_REPORTS_INFO_TEXT =
  "Golden Reports are a special category where projects with hardworking teams, strong culture, potential, and relevance are listed. Reports generated for these projects include an exclusive “Team Updates” section, where teams share the latest updates on what they’re building and the moves they’re making.";

const PUMP_REPORTS_INFO_TEXT =
  "Projects listed in this category are highly volatile in nature but also have the highest potential based on several factors, including narrative, team backing, and more. Proceed with caution. Projects that mature and reach stronger valuation stages are automatically transferred to the Golden Reports listing.";

const GOLDEN_INFO_ZONE_RIGHT_FRACTION = 0.8;

type TooltipDesktopPlacement = "above" | "right";

type TooltipPos =
  | { variant: "above"; bottom: number; left: number }
  | { variant: "right"; top: number; left: number };

/** Tooltip portaled to `body`; `open` when pointer is in the right 20% of the image button. */
function GoldenReportsTooltipPortal({
  open,
  tooltipId,
  imageButtonDesktopRef,
  imageButtonMobileRef,
  pillAlignDesktopRef,
  pillAlignMobileRef,
  infoText = GOLDEN_REPORTS_INFO_TEXT,
  desktopPlacement = "above",
}: {
  open: boolean;
  tooltipId: string;
  imageButtonDesktopRef: RefObject<HTMLButtonElement | null>;
  imageButtonMobileRef: RefObject<HTMLButtonElement | null>;
  pillAlignDesktopRef: RefObject<HTMLElement | null>;
  pillAlignMobileRef: RefObject<HTMLElement | null>;
  infoText?: string;
  /** `right` = to the right of the pill on desktop only; mobile keeps centered-above. */
  desktopPlacement?: TooltipDesktopPlacement;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [tipPos, setTipPos] = useState<TooltipPos>({
    variant: "above",
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const pickVisibleImageButton = useCallback((): HTMLElement | null => {
    const d = imageButtonDesktopRef.current;
    const m = imageButtonMobileRef.current;
    const dw = d?.getBoundingClientRect().width ?? 0;
    const mw = m?.getBoundingClientRect().width ?? 0;
    if (dw > 1) return d;
    if (mw > 1) return m;
    return d ?? m;
  }, [imageButtonDesktopRef, imageButtonMobileRef]);

  const measureTip = useCallback(() => {
    const el = pickVisibleImageButton();
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();

    const desktop = pillAlignDesktopRef?.current;
    const mobile = pillAlignMobileRef?.current;
    const desktopRect = desktop?.getBoundingClientRect();
    const mobileRect = mobile?.getBoundingClientRect();
    const desktopVisible = !!desktopRect && desktopRect.width > 1;
    const mobileVisible = !!mobileRect && mobileRect.width > 1;

    let alignRect = rect;
    if (desktopVisible && desktopRect) {
      alignRect = desktopRect;
    } else if (mobileVisible && mobileRect) {
      alignRect = mobileRect;
    }

    const gap = 8;
    const pad = 12;

    if (desktopPlacement === "right" && desktopVisible && desktopRect) {
      const tipEl = tooltipRef.current;
      let left = desktopRect.right + gap;
      let top = desktopRect.top + desktopRect.height / 2;
      if (tipEl) {
        const tw = tipEl.offsetWidth;
        const th = tipEl.offsetHeight;
        if (left + tw > window.innerWidth - pad) {
          left = desktopRect.left - tw - gap;
        }
        left = Math.max(pad, Math.min(window.innerWidth - pad - tw, left));
        top = Math.max(
          pad + th / 2,
          Math.min(window.innerHeight - pad - th / 2, top),
        );
      }
      setTipPos({ variant: "right", top, left });
      return;
    }

    let left = alignRect.left + alignRect.width / 2;
    const tipEl = tooltipRef.current;
    if (tipEl) {
      const halfW = tipEl.offsetWidth / 2;
      left = Math.max(
        pad + halfW,
        Math.min(window.innerWidth - pad - halfW, left),
      );
    }
    setTipPos({
      variant: "above",
      bottom: window.innerHeight - rect.top + gap,
      left,
    });
  }, [
    pickVisibleImageButton,
    pillAlignDesktopRef,
    pillAlignMobileRef,
    desktopPlacement,
  ]);

  useLayoutEffect(() => {
    if (!open || !mounted) return;
    measureTip();
    const id = requestAnimationFrame(() => measureTip());
    const onReposition = () => measureTip();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, mounted, measureTip]);

  const tooltipPortal =
    mounted && open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            style={
              tipPos.variant === "above"
                ? {
                    position: "fixed",
                    bottom: tipPos.bottom,
                    left: tipPos.left,
                    transform: "translateX(-50%)",
                    zIndex: 99999,
                  }
                : {
                    position: "fixed",
                    top: tipPos.top,
                    left: tipPos.left,
                    transform: "translateY(-50%)",
                    zIndex: 99999,
                  }
            }
            className={clsx(
              "pointer-events-none w-max max-w-[min(22rem,calc(100vw-2rem))]",
              "rounded-lg border border-white/15 bg-[#141414] px-3 py-2.5 text-left text-xs leading-relaxed text-white/95 shadow-xl",
            )}
          >
            {infoText}
          </div>,
          document.body,
        )
      : null;

  return <>{tooltipPortal}</>;
}

function setGoldenInfoOpenFromPointer(
  clientX: number,
  el: HTMLElement,
  setOpen: (v: boolean) => void,
) {
  const rect = el.getBoundingClientRect();
  const w = rect.width;
  if (w <= 0) return;
  const x = clientX - rect.left;
  setOpen(x >= w * GOLDEN_INFO_ZONE_RIGHT_FRACTION);
}

function isInGoldenInfoZone(clientX: number, el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const w = rect.width;
  if (w <= 0) return false;
  const x = clientX - rect.left;
  return x >= w * GOLDEN_INFO_ZONE_RIGHT_FRACTION;
}

/* ============================ Main Component ============================ */

interface TrendingTableContentProps {
  onReportGenerated?: (report: any, token?: TrendingToken | null) => void;
  currentUserId: string;
  isAdmin: boolean;
  onTokenSelect?: (
    token: TrendingToken | null,
    address: string | null,
    isViewing: boolean
  ) => void;
  screenerChain: Chain;
  onScreenerChainNavigate: (chain: Chain) => void;
  externalTokenForChart?: TrendingToken | null;
  externalViewingChart?: boolean;
  deepLinkTableOverlay?: null | "loading" | "not-found";
}

function buildChartTitle(t: TrendingToken): string {
  const lowerChainId = t?.chainId?.toLowerCase();
  const isBaseChain = lowerChainId === "base" || t?.chainId === "8453";
  const isBnbChain = lowerChainId === "bsc" || t?.chainId === "56";
  const isMonadChain = lowerChainId === "monad" || t?.chainId === "10143";
  const isEthereumChain =
    lowerChainId === "ethereum" || lowerChainId === "eth" || t?.chainId === "1";
  const baseCurrency = isBaseChain
    ? "WETH"
    : isEthereumChain
      ? "ETH"
    : isBnbChain
      ? "WBNB"
      : isMonadChain
        ? "MON"
        : "SOL";
  return `${t?.name ?? t?.symbol ?? "Token"} / ${baseCurrency}`;
}

export function TrendingTableContent({
  onReportGenerated,
  currentUserId,
  isAdmin,
  onTokenSelect,
  screenerChain,
  onScreenerChainNavigate,
  externalTokenForChart = null,
  externalViewingChart = false,
  deepLinkTableOverlay = null,
}: TrendingTableContentProps) {
  const deepLinkBlocksTrendingLoaders = deepLinkTableOverlay !== null;

  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  /** Horizontal scroll only (nested under vertical main) — fixes iOS biaxial scroll sticking. */
  const horizScrollRef = useRef<HTMLDivElement | null>(null);
  const headerContentRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const goldenRowRichCacheRef = useRef(new Map<string, TrendingToken>());
  const pumpRowRichCacheRef = useRef(new Map<string, TrendingToken>());

  const goldenReportsPillDesktopRef = useRef<HTMLDivElement | null>(null);
  const goldenReportsPillMobileRef = useRef<HTMLDivElement | null>(null);
  const goldenReportImageBtnDesktopRef = useRef<HTMLButtonElement | null>(null);
  const goldenReportImageBtnMobileRef = useRef<HTMLButtonElement | null>(null);
  const goldenReportsTooltipId = useId().replace(/:/g, "");
  const [goldenReportsInfoOpen, setGoldenReportsInfoOpen] = useState(false);
  const lastGoldenTapClientXRef = useRef<number | null>(null);

  const pumpReportsPillDesktopRef = useRef<HTMLDivElement | null>(null);
  const pumpReportsPillMobileRef = useRef<HTMLDivElement | null>(null);
  const pumpReportImageBtnDesktopRef = useRef<HTMLButtonElement | null>(null);
  const pumpReportImageBtnMobileRef = useRef<HTMLButtonElement | null>(null);
  const pumpReportsTooltipId = useId().replace(/:/g, "");
  const [pumpReportsInfoOpen, setPumpReportsInfoOpen] = useState(false);
  const lastPumpTapClientXRef = useRef<number | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchType, setSearchType] = useState<"ticker" | "address" | null>(
    null
  );
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [goldenReportsOnly, setGoldenReportsOnly] = useState(false);
  const [pumpReportsOnly, setPumpReportsOnly] = useState(false);

  const queryClient = useQueryClient();
  const prevScreenerChainRef = useRef(screenerChain);
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,

    pageIndex,
    pageSize,
    totalPages,
    hasPrev,
    hasNext,
    nextPage,
    prevPage,
    setPageIndex,
    setPageSize,

    sortField,
    sortDirection,
    onSort,

    isPageLoading,

    jupVerifiedTotal,
    upstreamTotal,
  } = useTrendingTokens(
    isSearchMode && searchQuery && searchType
      ? {
          search_query: searchQuery,
          search_type: searchType,
          chain: screenerChain,
        }
      : {
          chain: screenerChain,
        },
    { enabled: !goldenReportsOnly && !pumpReportsOnly },
  );

  const {
    data: goldenScreenerPayload,
    isPending: goldenScreenerPending,
    isFetching: goldenScreenerFetching,
    isError: goldenScreenerError,
    error: goldenScreenerErr,
    refetch: refetchGoldenScreener,
  } = useQuery({
    queryKey: ["golden-screener-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/golden-reports/screener-tokens", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Golden Reports list failed: ${res.statusText}`);
      }
      return res.json() as Promise<{
        ok?: boolean;
        items?: unknown[];
        registryCount?: number;
      }>;
    },
    enabled: goldenReportsOnly,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const {
    data: pumpScreenerPayload,
    isPending: pumpScreenerPending,
    isFetching: pumpScreenerFetching,
    isError: pumpScreenerError,
    error: pumpScreenerErr,
    refetch: refetchPumpScreener,
  } = useQuery({
    queryKey: ["pump-screener-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/pump-reports/screener-tokens", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Pump Reports list failed: ${res.statusText}`);
      }
      return res.json() as Promise<{
        ok?: boolean;
        items?: unknown[];
        registryCount?: number;
      }>;
    },
    enabled: pumpReportsOnly,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: goldenProjectKeysPayload } = useQuery({
    queryKey: ["golden-report-project-keys"],
    queryFn: async () => {
      const res = await fetch("/api/golden-reports/project-keys", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Golden registry keys failed: ${res.statusText}`);
      }
      return res.json() as Promise<{ ok?: boolean; keys?: unknown[] }>;
    },
    staleTime: 60_000,
  });

  const { data: pumpProjectKeysPayload } = useQuery({
    queryKey: ["pump-report-project-keys"],
    queryFn: async () => {
      const res = await fetch("/api/pump-reports/project-keys", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Pump registry keys failed: ${res.statusText}`);
      }
      return res.json() as Promise<{ ok?: boolean; keys?: unknown[] }>;
    },
    staleTime: 60_000,
  });

  const goldenProjectKeySet = useMemo(() => {
    const raw = goldenProjectKeysPayload?.keys;
    if (!Array.isArray(raw)) return new Set<string>();
    return new Set(
      raw.filter((k): k is string => typeof k === "string" && k.length > 0),
    );
  }, [goldenProjectKeysPayload]);

  const pumpProjectKeySet = useMemo(() => {
    const raw = pumpProjectKeysPayload?.keys;
    if (!Array.isArray(raw)) return new Set<string>();
    return new Set(
      raw.filter((k): k is string => typeof k === "string" && k.length > 0),
    );
  }, [pumpProjectKeysPayload]);

  useEffect(() => {
    if (!goldenReportsOnly) goldenRowRichCacheRef.current.clear();
  }, [goldenReportsOnly]);

  useEffect(() => {
    if (!pumpReportsOnly) pumpRowRichCacheRef.current.clear();
  }, [pumpReportsOnly]);

  const goldenBaseItems = useMemo(() => {
    const raw = goldenScreenerPayload?.items;
    if (!Array.isArray(raw)) return [];
    const incoming = raw.filter(
      (x) => x && typeof x === "object",
    ) as TrendingToken[];
    return applyScreenerRowRichCache(
      incoming,
      goldenRowRichCacheRef.current,
    );
  }, [goldenScreenerPayload]);

  const pumpBaseItems = useMemo(() => {
    const raw = pumpScreenerPayload?.items;
    if (!Array.isArray(raw)) return [];
    const incoming = raw.filter(
      (x) => x && typeof x === "object",
    ) as TrendingToken[];
    return applyScreenerRowRichCache(incoming, pumpRowRichCacheRef.current);
  }, [pumpScreenerPayload]);

  const goldenAgeQueryKey = useMemo(
    () =>
      [
        "golden-screener-ages",
        goldenBaseItems.map((t) => t.tokenAddress ?? "").join("|"),
      ] as const,
    [goldenBaseItems],
  );

  const pumpAgeQueryKey = useMemo(
    () =>
      [
        "pump-screener-ages",
        pumpBaseItems.map((t) => t.tokenAddress ?? "").join("|"),
      ] as const,
    [pumpBaseItems],
  );

  const {
    data: goldenAgesPayload,
    isPending: goldenAgesPending,
    isFetching: goldenAgesFetching,
  } = useQuery({
    queryKey: goldenAgeQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/golden-reports/screener-tokens/ages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ items: goldenBaseItems }),
      });
      if (!res.ok) {
        throw new Error(`Golden Reports ages failed: ${res.statusText}`);
      }
      return res.json() as Promise<{
        ok?: boolean;
        ages?: Record<string, number | undefined>;
      }>;
    },
    enabled: goldenReportsOnly && goldenBaseItems.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const {
    data: pumpAgesPayload,
    isPending: pumpAgesPending,
    isFetching: pumpAgesFetching,
  } = useQuery({
    queryKey: pumpAgeQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/pump-reports/screener-tokens/ages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ items: pumpBaseItems }),
      });
      if (!res.ok) {
        throw new Error(`Pump Reports ages failed: ${res.statusText}`);
      }
      return res.json() as Promise<{
        ok?: boolean;
        ages?: Record<string, number | undefined>;
      }>;
    },
    enabled: pumpReportsOnly && pumpBaseItems.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const goldenRawItems = useMemo(
    () => mergeScreenerTokenAges(goldenBaseItems, goldenAgesPayload?.ages),
    [goldenBaseItems, goldenAgesPayload?.ages],
  );

  const pumpRawItems = useMemo(
    () => mergeScreenerTokenAges(pumpBaseItems, pumpAgesPayload?.ages),
    [pumpBaseItems, pumpAgesPayload?.ages],
  );

  const goldenAgesLoading =
    goldenReportsOnly &&
    goldenBaseItems.length > 0 &&
    (goldenAgesPending || goldenAgesFetching);

  const pumpAgesLoading =
    pumpReportsOnly &&
    pumpBaseItems.length > 0 &&
    (pumpAgesPending || pumpAgesFetching);

  const goldenRegistryCount = Math.max(
    typeof goldenScreenerPayload?.registryCount === "number"
      ? goldenScreenerPayload.registryCount
      : 0,
    goldenProjectKeySet.size,
  );

  const pumpRegistryCount = Math.max(
    typeof pumpScreenerPayload?.registryCount === "number"
      ? pumpScreenerPayload.registryCount
      : 0,
    pumpProjectKeySet.size,
  );

  const goldenFetchSettled =
    !goldenReportsOnly ||
    goldenScreenerError ||
    goldenScreenerPayload !== undefined;

  const pumpFetchSettled =
    !pumpReportsOnly || pumpScreenerError || pumpScreenerPayload !== undefined;

  /** Keep loading until first successful payload — avoids empty flash after cache reset / refetch. */
  const goldenTableStillLoading =
    goldenReportsOnly &&
    (!goldenFetchSettled ||
      goldenScreenerPending ||
      (goldenScreenerFetching &&
        goldenBaseItems.length === 0 &&
        goldenRegistryCount > 0));

  const pumpTableStillLoading =
    pumpReportsOnly &&
    (!pumpFetchSettled ||
      pumpScreenerPending ||
      (pumpScreenerFetching &&
        pumpBaseItems.length === 0 &&
        pumpRegistryCount > 0));

  const goldenMetadataGap =
    goldenReportsOnly &&
    goldenFetchSettled &&
    !goldenScreenerError &&
    goldenRegistryCount > 0 &&
    goldenBaseItems.length === 0;

  const pumpMetadataGap =
    pumpReportsOnly &&
    pumpFetchSettled &&
    !pumpScreenerError &&
    pumpRegistryCount > 0 &&
    pumpBaseItems.length === 0;

  const goldenRowsWithRank = useMemo(() => {
    if (!goldenReportsOnly) return [];
    const sorted = sortTokens(
      goldenRawItems,
      sortField,
      sortDirection,
    ) as TrendingToken[];
    return sorted.map((row, i) => ({
      ...row,
      _rank: i + 1,
    }));
  }, [goldenReportsOnly, goldenRawItems, sortField, sortDirection]);

  const pumpRowsWithRank = useMemo(() => {
    if (!pumpReportsOnly) return [];
    const sorted = sortTokens(
      pumpRawItems,
      sortField,
      sortDirection,
    ) as TrendingToken[];
    return sorted.map((row, i) => ({
      ...row,
      _rank: i + 1,
    }));
  }, [pumpReportsOnly, pumpRawItems, sortField, sortDirection]);

  useEffect(() => {
    if (prevScreenerChainRef.current === screenerChain) return;
    prevScreenerChainRef.current = screenerChain;
    setPageIndex(1);
  }, [screenerChain, setPageIndex]);

  const rows = Array.isArray(data) ? data : [];
  const displayRows = goldenReportsOnly
    ? goldenRowsWithRank
    : pumpReportsOnly
      ? pumpRowsWithRank
      : rows;

  const { series: sparklineSeries, isFetching: sparklinesFetching } =
    useTrendingSparklines(displayRows);

  const handleScreenerChainNavigate = useCallback(
    (chain: Chain) => {
      setGoldenReportsOnly(false);
      setPumpReportsOnly(false);
      onScreenerChainNavigate(chain);
    },
    [onScreenerChainNavigate],
  );

  /** Per contract: survives TableRow → DexscreenerView and duplicate early-return calls. */
  const lastReportTokenByAddressRef = useRef(new Map<string, TrendingToken>());
  const {
    generateFromToken: hookGenerateFromToken,
    adminGenerateAndStoreFromToken,
  } = useGenerateRexReport({
    onReportGenerated: (r) => {
      const addr = r?.contractAddress ? String(r.contractAddress).trim() : "";
      let t: TrendingToken | null = null;
      if (addr) {
        const evm = addr.startsWith("0x");
        const keyLow = evm ? addr.toLowerCase() : addr;
        t =
          lastReportTokenByAddressRef.current.get(addr) ??
          (evm ? lastReportTokenByAddressRef.current.get(keyLow) ?? null : null);
        lastReportTokenByAddressRef.current.delete(addr);
        if (evm) lastReportTokenByAddressRef.current.delete(keyLow);
      }
      onReportGenerated?.(r, t);
    },
    userId: currentUserId,
  });
  const generateFromToken = useCallback(
    async (t: TrendingToken) => {
      const addr = (t?.tokenAddress ?? "").trim();
      if (addr) {
        lastReportTokenByAddressRef.current.set(addr, t);
        if (addr.startsWith("0x")) {
          lastReportTokenByAddressRef.current.set(addr.toLowerCase(), t);
        }
      }
      return await hookGenerateFromToken(t);
    },
    [hookGenerateFromToken],
  );

  const lastListStateRef = useRef<{
    pageIndex: number;
    scrollTop: number;
    scrollLeft: number;
  }>({
    pageIndex: 1,
    scrollTop: 0,
    scrollLeft: 0,
  });

  // helper to capture list state before leaving
  const captureListState = () => {
    lastListStateRef.current = {
      pageIndex,
      scrollTop: mainScrollRef.current?.scrollTop ?? 0,
      scrollLeft:
        horizScrollRef.current?.scrollLeft ??
        mainScrollRef.current?.scrollLeft ??
        0,
    };
  };

  // helper to restore after coming back
  const restoreListState = () => {
    const { pageIndex: p, scrollTop, scrollLeft } = lastListStateRef.current;

    // 1) restore page first (this may re-render/fetch)
    if (p && p !== pageIndex) setPageIndex(p);

    // 2) after layout is measured, restore scroll positions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (mainScrollRef.current) {
          mainScrollRef.current.scrollTop = scrollTop;
        }
        if (horizScrollRef.current) {
          horizScrollRef.current.scrollLeft = scrollLeft;
        }
        if (topScrollRef.current) {
          topScrollRef.current.scrollLeft = scrollLeft;
        }
        syncHeaderScrollPosition(scrollLeft);
      });
    });
  };

  const handleOpenChart = (t: TrendingToken) => {
    const addr = t?.tokenAddress || "";
    if (!addr) return;

    captureListState();
    handleClearSearch({ keepPage: true });
    onTokenSelect?.(t, addr, true);
  };

  const handleBackFromChart = () => {
    onTokenSelect?.(null, null, false);

    // ⬇️ restore the page/scroll
    restoreListState();
  };

  const handleSearch = (query: string, type: "ticker" | "address") => {
    setGoldenReportsOnly(false);
    setPumpReportsOnly(false);
    setSearchQuery(query);
    setSearchType(type);
    setIsSearchMode(true);
    setPageIndex(1);
  };

  const handleClearSearch = (opts?: { keepPage?: boolean }) => {
    setSearchQuery("");
    setSearchType(null);
    setIsSearchMode(false);
    if (!opts?.keepPage) setPageIndex(1); // <-- only reset when not told to keep
  };

  const toggleGoldenReports = useCallback(() => {
    setGoldenReportsOnly((prev) => {
      const turningOn = !prev;
      if (turningOn) {
        setPumpReportsOnly(false);
        setSearchQuery("");
        setSearchType(null);
        setIsSearchMode(false);
        void queryClient.invalidateQueries({
          queryKey: ["golden-screener-tokens"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["golden-screener-ages"],
        });
      }
      return turningOn;
    });
    setMobileSearchOpen(false);
  }, [queryClient]);

  const togglePumpReports = useCallback(() => {
    setPumpReportsOnly((prev) => {
      const turningOn = !prev;
      if (turningOn) {
        setGoldenReportsOnly(false);
        setSearchQuery("");
        setSearchType(null);
        setIsSearchMode(false);
        void queryClient.invalidateQueries({
          queryKey: ["pump-screener-tokens"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["pump-screener-ages"],
        });
      }
      return turningOn;
    });
    setMobileSearchOpen(false);
  }, [queryClient]);

  const handleGoldenButtonPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      lastGoldenTapClientXRef.current = e.clientX;
    },
    [],
  );

  const handleGoldenButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const pointerX = lastGoldenTapClientXRef.current ?? e.clientX;
      lastGoldenTapClientXRef.current = null;
      if (isInGoldenInfoZone(pointerX, e.currentTarget)) {
        setGoldenReportsInfoOpen((prev) => !prev);
        return;
      }
      setGoldenReportsInfoOpen(false);
      toggleGoldenReports();
    },
    [toggleGoldenReports],
  );

  const handlePumpButtonPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      lastPumpTapClientXRef.current = e.clientX;
    },
    [],
  );

  const handlePumpButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const pointerX = lastPumpTapClientXRef.current ?? e.clientX;
      lastPumpTapClientXRef.current = null;
      if (isInGoldenInfoZone(pointerX, e.currentTarget)) {
        setPumpReportsInfoOpen((prev) => !prev);
        return;
      }
      setPumpReportsInfoOpen(false);
      togglePumpReports();
    },
    [togglePumpReports],
  );

  useEffect(() => {
    if (!goldenReportsInfoOpen) return;
    const closeInfo = () => setGoldenReportsInfoOpen(false);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInfo();
    };
    document.addEventListener("pointerdown", closeInfo);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", closeInfo);
      document.removeEventListener("keydown", onEscape);
    };
  }, [goldenReportsInfoOpen]);

  useEffect(() => {
    if (!pumpReportsInfoOpen) return;
    const closeInfo = () => setPumpReportsInfoOpen(false);
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInfo();
    };
    document.addEventListener("pointerdown", closeInfo);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", closeInfo);
      document.removeEventListener("keydown", onEscape);
    };
  }, [pumpReportsInfoOpen]);

  // --- State
  const [ghostWidth, setGhostWidth] = useState(1);
  const [ready, setReady] = useState(false); // when true, allow top bar interaction
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const syncHeaderScrollPosition = useCallback((left: number) => {
    if (!headerContentRef.current) return;
    headerContentRef.current.style.transform = `translateX(-${left}px)`;
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
    const hasOverflow = width > main.clientWidth + 1;

    setGhostWidth(width);
    setHasHorizontalOverflow(hasOverflow);

    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = horiz.scrollLeft;
    }
    syncHeaderScrollPosition(horiz.scrollLeft);
  }, []);

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayRows.length,
    sortField,
    sortDirection,
    pageSize,
    pageIndex,
    sparklinesFetching,
    sparklineSeries,
  ]);

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
    if (!externalViewingChart || !externalTokenForChart?.tokenAddress) {
      setReady(false);
      deferredMeasure();
      const t = setTimeout(deferredMeasure, 60);
      return () => clearTimeout(t);
    }
  }, [externalViewingChart, externalTokenForChart?.tokenAddress, deferredMeasure]);

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

  const onTopScroll = (e: UIEvent<HTMLDivElement>) => {
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
  };

  const onHorizScroll = (e: UIEvent<HTMLDivElement>) => {
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
  };

  /** While browsing Golden/Pump lists, do not block the table with URL token resolution overlay. */
  const suppressDeepLinkTableOverlay =
    goldenReportsOnly || pumpReportsOnly;

  // --- Centered overlay: while a /[chain]/[token] deep link shows loading or not-found, only show the
  // deep-link overlay — avoid stacking "Loading token…" with page/trending loaders.
  const showCenteredOverlay =
    (goldenReportsOnly && goldenTableStillLoading) ||
    (goldenReportsOnly && goldenScreenerError) ||
    (pumpReportsOnly && pumpTableStillLoading) ||
    (pumpReportsOnly && pumpScreenerError) ||
    (!goldenReportsOnly &&
      !pumpReportsOnly &&
      ((isLoading && rows.length === 0 && !deepLinkBlocksTrendingLoaders) ||
        isError));

  // Chart only when URL + shell agree (row click, Generate, or deep link).
  if (externalViewingChart && externalTokenForChart?.tokenAddress) {
    const addr = externalTokenForChart.tokenAddress;
    const title = buildChartTitle(externalTokenForChart);
    return (
      <DexscreenerView
        token={externalTokenForChart}
        tokenAddress={addr}
        title={title}
        onBack={handleBackFromChart}
        currentUserId={currentUserId}
        generateFromToken={generateFromToken}
      />
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 sm:gap-3">
      <GoldenReportsTooltipPortal
        open={goldenReportsInfoOpen}
        tooltipId={goldenReportsTooltipId}
        imageButtonDesktopRef={goldenReportImageBtnDesktopRef}
        imageButtonMobileRef={goldenReportImageBtnMobileRef}
        pillAlignDesktopRef={goldenReportsPillDesktopRef}
        pillAlignMobileRef={goldenReportsPillMobileRef}
      />
      <GoldenReportsTooltipPortal
        open={pumpReportsInfoOpen}
        tooltipId={pumpReportsTooltipId}
        imageButtonDesktopRef={pumpReportImageBtnDesktopRef}
        imageButtonMobileRef={pumpReportImageBtnMobileRef}
        pillAlignDesktopRef={pumpReportsPillDesktopRef}
        pillAlignMobileRef={pumpReportsPillMobileRef}
        infoText={PUMP_REPORTS_INFO_TEXT}
        desktopPlacement="right"
      />
      <div className="px-4 py-3 pb-0 sm:pb-3 flex flex-col sm:flex-row items-start justify-center sm:justify-between gap-3 sm:gap-10">
        {/* Desktop: ChainButtons + TokenSearchBar side by side */}
        <div className="hidden sm:flex flex-1 sm:flex-row items-start justify-center sm:justify-between gap-5 sm:gap-10 w-full">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <ChainButtons
              selectedChain={screenerChain}
              onChainChange={handleScreenerChainNavigate}
            />
            <div className="inline-flex items-center gap-0.5 shrink-0 min-w-0 max-w-full">
            <div
              ref={goldenReportsPillDesktopRef}
              className={clsx(
                "inline-flex h-9 shrink-0 items-center rounded-xl px-0.5 transition-colors",
                goldenReportsOnly && "bg-[#ffc000]/12",
              )}
            >
              <button
                ref={goldenReportImageBtnDesktopRef}
                type="button"
                onPointerDown={handleGoldenButtonPointerDown}
                onClick={handleGoldenButtonClick}
                onPointerMove={(e) =>
                  setGoldenInfoOpenFromPointer(
                    e.clientX,
                    e.currentTarget,
                    setGoldenReportsInfoOpen,
                  )
                }
                onPointerLeave={() => setGoldenReportsInfoOpen(false)}
                className={clsx(
                  "relative flex h-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent px-1 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-[#ffc000]/40 focus-visible:ring-offset-0",
                )}
                title="Show tokens in the Golden Reports program"
                aria-pressed={goldenReportsOnly}
                aria-label="Golden Reports filter"
                aria-describedby={
                  goldenReportsInfoOpen ? goldenReportsTooltipId : undefined
                }
              >
                <Image
                  src="/images/btn_golden-report.webp"
                  alt="Golden Reports"
                  width={120}
                  height={28}
                  className="h-5 w-auto max-h-5 shrink-0 object-contain sm:h-8 sm:max-h-8"
                />
              </button>
            </div>
            <div
              ref={pumpReportsPillDesktopRef}
              className={clsx(
                "inline-flex h-9 shrink-0 items-center rounded-xl px-0.5 transition-colors",
                pumpReportsOnly && "bg-white/10",
              )}
            >
              <button
                ref={pumpReportImageBtnDesktopRef}
                type="button"
                onPointerDown={handlePumpButtonPointerDown}
                onClick={handlePumpButtonClick}
                onPointerMove={(e) =>
                  setGoldenInfoOpenFromPointer(
                    e.clientX,
                    e.currentTarget,
                    setPumpReportsInfoOpen,
                  )
                }
                onPointerLeave={() => setPumpReportsInfoOpen(false)}
                className={clsx(
                  "relative flex h-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent px-1 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0",
                )}
                title="Show tokens in the Pump Reports program"
                aria-pressed={pumpReportsOnly}
                aria-label="Pump Reports filter"
                aria-describedby={
                  pumpReportsInfoOpen ? pumpReportsTooltipId : undefined
                }
              >
                <Image
                  src="/images/btn_pump-report.webp"
                  alt="Pump Reports"
                  width={120}
                  height={28}
                  className="h-5 w-auto max-h-5 shrink-0 object-contain sm:h-8 sm:max-h-8"
                />
              </button>
            </div>
            </div>
          </div>
          <div className="w-full sm:flex-1 flex justify-center sm:justify-end">
            <div className="w-full max-w-full sm:max-w-75">
              <TokenSearchBar
                onSearch={handleSearch}
                onClear={handleClearSearch}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Mobile: search icon next to ChainButtons; tap to expand full search with close (same UI as RexMarkets) */}
        <div className="sm:hidden relative overflow-hidden min-h-[44px] w-full">
          {/* Row 1: ChainButtons + search icon (slides left when search expanded) */}
          <div
            className={clsx(
              "flex items-center justify-between gap-2 w-full transition-transform duration-300 ease-out",
              mobileSearchOpen ? "-translate-x-full" : "translate-x-0"
            )}
          >
            <div className="flex min-w-0 flex-1 items-center">
              <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
                <ChainButtons
                  selectedChain={screenerChain}
                  onChainChange={handleScreenerChainNavigate}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              className="flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-xl text-white hover:text-white hover:bg-white/20 transition-colors"
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
              <TokenSearchBar
                onSearch={(query, type) => {
                  handleSearch(query, type);
                  setMobileSearchOpen(false);
                }}
                onClear={handleClearSearch}
                className="w-full"
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

        {/* Mobile: Golden + Pump — inline-flex group so buttons don’t stretch like block flex rows */}
        <div className="sm:hidden flex w-full shrink-0 justify-center pt-0">
          <div className="inline-flex max-w-full items-center gap-0.5 rounded-xl transition-colors">
            <div
              ref={goldenReportsPillMobileRef}
              className={clsx(
                "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors",
                goldenReportsOnly && "bg-[#ffc000]/12",
              )}
            >
              <button
                ref={goldenReportImageBtnMobileRef}
                type="button"
                onPointerDown={handleGoldenButtonPointerDown}
                onClick={handleGoldenButtonClick}
                onPointerMove={(e) =>
                  setGoldenInfoOpenFromPointer(
                    e.clientX,
                    e.currentTarget,
                    setGoldenReportsInfoOpen,
                  )
                }
                onPointerLeave={() => setGoldenReportsInfoOpen(false)}
                className={clsx(
                  "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-[#ffc000]/40 focus-visible:ring-inset focus-visible:ring-offset-0",
                )}
                title="Show tokens in the Golden Reports program"
                aria-pressed={goldenReportsOnly}
                aria-label="Golden Reports filter"
                aria-describedby={
                  goldenReportsInfoOpen ? goldenReportsTooltipId : undefined
                }
              >
                <Image
                  src="/images/btn_golden-report.webp"
                  alt="Golden Reports"
                  width={3524}
                  height={760}
                  sizes="(max-width: 640px) 45vw, 200px"
                  className="h-auto max-h-10 w-auto max-w-[11rem] object-contain"
                />
              </button>
            </div>
            <div
              ref={pumpReportsPillMobileRef}
              className={clsx(
                "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors",
                pumpReportsOnly && "bg-white/10",
              )}
            >
              <button
                ref={pumpReportImageBtnMobileRef}
                type="button"
                onPointerDown={handlePumpButtonPointerDown}
                onClick={handlePumpButtonClick}
                onPointerMove={(e) =>
                  setGoldenInfoOpenFromPointer(
                    e.clientX,
                    e.currentTarget,
                    setPumpReportsInfoOpen,
                  )
                }
                onPointerLeave={() => setPumpReportsInfoOpen(false)}
                className={clsx(
                  "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-inset focus-visible:ring-offset-0",
                )}
                title="Show tokens in the Pump Reports program"
                aria-pressed={pumpReportsOnly}
                aria-label="Pump Reports filter"
                aria-describedby={
                  pumpReportsInfoOpen ? pumpReportsTooltipId : undefined
                }
              >
                <Image
                  src="/images/btn_pump-report.webp"
                  alt="Pump Reports"
                  width={3524}
                  height={760}
                  sizes="(max-width: 640px) 45vw, 200px"
                  className="h-auto max-h-10 w-auto max-w-[11rem] object-contain"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rexscreener-trending-table-frame relative flex min-h-0 flex-1 flex-col overflow-hidden border-b border-white/10 touch-manipulation">
        {isPageLoading &&
          !goldenReportsOnly &&
          !pumpReportsOnly &&
          !deepLinkBlocksTrendingLoaders && <PageLoaderOverlay />}

        {deepLinkTableOverlay !== null && !suppressDeepLinkTableOverlay && (
          <div className="absolute inset-0 z-[18] flex items-center justify-center bg-black/50">
            {deepLinkTableOverlay === "loading" && (
              <div className="flex items-center text-[#FFC000]">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                <span>Loading token…</span>
              </div>
            )}
            {deepLinkTableOverlay === "not-found" && (
              <div className="flex flex-col items-center gap-4 px-4 text-center">
                <p className="text-white/90">
                  We couldn&apos;t load this token from the URL.
                </p>
                <button
                  type="button"
                  onClick={() => onScreenerChainNavigate(screenerChain)}
                  className="px-3 py-1.5 rounded border border-white/20 text-sm text-white hover:bg-white/10 transition"
                >
                  Back to screener
                </button>
              </div>
            )}
          </div>
        )}

        {showCenteredOverlay && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg shadow-2xl text-[#FFC000]">
              {goldenReportsOnly && goldenTableStillLoading && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                  <span>Loading Golden Reports…</span>
                </div>
              )}
              {goldenReportsOnly && goldenScreenerError && (
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <span className="text-[#FFC000]">
                    {(goldenScreenerErr as Error)?.message ?? "Failed to load"}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchGoldenScreener()}
                    className="underline hover:opacity-80 cursor-pointer text-sm"
                  >
                    Retry
                  </button>
                </div>
              )}
              {pumpReportsOnly && pumpTableStillLoading && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                  <span>Loading Pump Reports…</span>
                </div>
              )}
              {pumpReportsOnly && pumpScreenerError && (
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <span className="text-[#FFC000]">
                    {(pumpScreenerErr as Error)?.message ?? "Failed to load"}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchPumpScreener()}
                    className="underline hover:opacity-80 cursor-pointer text-sm"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!goldenReportsOnly && !pumpReportsOnly && isLoading && rows.length === 0 && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                  <span>Loading trending tokens…</span>
                </div>
              )}
              {!goldenReportsOnly && !pumpReportsOnly && isError && (
                <div className="flex items-center">
                  <span className="text-[#FFC000]">
                    Failed to load. {(error as Error)?.message ?? ""}
                  </span>
                  <button
                    onClick={() => refetch()}
                    className="ml-3 underline hover:opacity-80 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Desktop: synced horizontal scrollbar; hidden on small viewports to avoid iOS dual-scroll fights */}
        <div
          ref={topScrollRef}
          className={`custom-hscroll-top z-10 hidden shrink-0 overflow-x-auto overflow-y-hidden bg-black/0 ${
            hasHorizontalOverflow ? "lg:block lg:h-4" : "lg:hidden"
          } ${
            ready ? "" : "pointer-events-none opacity-80"
          }`}
          onScroll={onTopScroll}
          aria-hidden="true"
          style={{
            scrollbarGutter: "stable both-edges" as CSSProperties["scrollbarGutter"],
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-x",
          }}
        >
          <div style={{ width: ghostWidth, height: 1 }} />
        </div>

        {/* Vertical scroll (outer) + horizontal scroll (inner) — smoother on iOS than one biaxial layer */}
        <div
          ref={mainScrollRef}
          className="rexscreener-trending-main-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden hide-vert-scroll touch-manipulation"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorY: "contain",
          }}
        >
          <div className="sticky top-0 z-40 overflow-hidden bg-black/95 backdrop-blur-sm">
            <div
              ref={headerContentRef}
              className="will-change-transform"
              style={{
                width: ghostWidth,
                transform: "translateX(0px)",
              }}
            >
              <TableHeader
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={onSort}
              />
            </div>
          </div>

          {/* Do not set touch-action: pan-x here — iOS will not bubble vertical pans to the outer scroller */}
          <div
            ref={horizScrollRef}
            className="min-w-0 w-full overflow-x-auto overflow-y-visible hide-bottom-hscroll"
            onScroll={onHorizScroll}
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorX: "contain",
            }}
          >
            <div ref={contentRef} className="w-full align-top">
              {!goldenReportsOnly &&
                !pumpReportsOnly &&
                !isLoading &&
                !isError &&
                displayRows.length === 0 && (
                  <div className="p-4 text-white/70">No data found.</div>
                )}

              {goldenReportsOnly &&
                goldenFetchSettled &&
                !goldenTableStillLoading &&
                !goldenScreenerError &&
                !goldenMetadataGap &&
                goldenRegistryCount === 0 && (
                  <div className="p-4 text-white/70">
                    No Golden Report projects yet.
                  </div>
                )}

              {goldenReportsOnly && goldenMetadataGap && (
                <div className="flex flex-col items-center gap-2 p-4 text-white/70">
                  <span>Couldn&apos;t load market data for Golden Reports.</span>
                  <button
                    type="button"
                    onClick={() => refetchGoldenScreener()}
                    className="text-sm text-[#FFC000] underline hover:opacity-80"
                  >
                    Retry
                  </button>
                </div>
              )}

              {pumpReportsOnly &&
                pumpFetchSettled &&
                !pumpTableStillLoading &&
                !pumpScreenerError &&
                !pumpMetadataGap &&
                pumpRegistryCount === 0 && (
                  <div className="p-4 text-white/70">
                    No Pump Report projects yet.
                  </div>
                )}

              {pumpReportsOnly && pumpMetadataGap && (
                <div className="flex flex-col items-center gap-2 p-4 text-white/70">
                  <span>Couldn&apos;t load market data for Pump Reports.</span>
                  <button
                    type="button"
                    onClick={() => refetchPumpScreener()}
                    className="text-sm text-[#FFC000] underline hover:opacity-80"
                  >
                    Retry
                  </button>
                </div>
              )}

              {(goldenReportsOnly
                ? !goldenTableStillLoading && !goldenScreenerError
                : pumpReportsOnly
                  ? !pumpTableStillLoading && !pumpScreenerError
                  : !isLoading && !isError) &&
                displayRows.length > 0 && (
                <div className="divide-y divide-white/10 w-full">
                  {displayRows.map((t, i) => {
                    const sk = trendSparklineCacheKey(t);
                    const registryKey = goldenRegistryKeyFromTrendingToken(t);
                    const useGoldenGenerateArt =
                      goldenReportsOnly ||
                      (registryKey != null &&
                        goldenProjectKeySet.has(registryKey));
                    const usePumpGenerateArt =
                      !useGoldenGenerateArt &&
                      (pumpReportsOnly ||
                        (registryKey != null &&
                          pumpProjectKeySet.has(registryKey)));
                    return (
                      <TableRow
                        key={t.tokenAddress ?? `${t.symbol ?? "row"}-${i}`}
                        token={t}
                        rank={t._rank ?? (pageIndex - 1) * pageSize + i + 1}
                        generateFromToken={generateFromToken}
                        adminGenerateAndStoreFromToken={
                          adminGenerateAndStoreFromToken
                        }
                        onOpenChart={handleOpenChart}
                        currentUserId={currentUserId}
                        isAdmin={isAdmin}
                        index={i}
                        showChainBadge={
                          goldenReportsOnly ||
                          pumpReportsOnly ||
                          screenerChain === "all"
                        }
                        sparklineY={
                          sk && sparklineSeries[sk]?.length
                            ? sparklineSeries[sk]
                            : undefined
                        }
                        sparklinesFetching={sparklinesFetching}
                        useGoldenGenerateArt={useGoldenGenerateArt}
                        usePumpGenerateArt={usePumpGenerateArt}
                        ageLoading={
                          (goldenAgesLoading || pumpAgesLoading) &&
                          !hasUsableTokenCreatedAt(t.createdAt)
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 text-sm text-white/80 px-2 pb-2">
        {!goldenReportsOnly && !pumpReportsOnly ? (
          <div className="flex flex-col sm:justify-between sm:flex-row lg:items-center gap-3">
            <div className="flex flex-row justify-between sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <button
                  className={`px-3 py-1 rounded border border-white/20 text-sm ${
                    hasPrev
                      ? "hover:bg-white/10"
                      : "opacity-40 cursor-not-allowed"
                  }`}
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
                    onChange={(e) => setPageIndex(Number(e.target.value))}
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
                  className={`px-3 py-1 rounded border border-white/20 text-sm ${
                    hasNext
                      ? "hover:bg-white/10"
                      : "opacity-40 cursor-not-allowed"
                  }`}
                  onClick={nextPage}
                  disabled={!hasNext}
                >
                  Next
                </button>
              </div>

              <label className="flex items-center gap-1 sm:gap-2">
                <RowsPerPageSelect
                  value={pageSize}
                  onChange={(n) => setPageSize(Number(n))}
                  options={[25, 50]}
                  direction="up"
                  className="sm:ml-1"
                />
              </label>
            </div>

            <div className="w-full sm:w-auto flex justify-center items-center lg:ml-auto">
              {typeof upstreamTotal === "number" && (
                <div className="text-white/40 text-xs sm:text-sm">
                  <div
                    className="
                    flex flex-row sm:items-center gap-1 sm:gap-2
                    [@media(min-width:1024px)_and_(max-width:1170px)]:flex-col
                  "
                  >
                    <span>Total: {upstreamTotal.toLocaleString()}</span>
                    {typeof jupVerifiedTotal === "number" && (
                      <span className="text-white/60">
                        (Jupiter Verified: {jupVerifiedTotal.toLocaleString()})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex justify-center sm:justify-end text-white/50 text-xs sm:text-sm px-1">
            {goldenReportsOnly &&
              (goldenTableStillLoading
                ? "…"
                : `Golden Reports: ${displayRows.length} project${
                    displayRows.length === 1 ? "" : "s"
                  }`)}
            {pumpReportsOnly &&
              (pumpTableStillLoading
                ? "…"
                : `Pump Reports: ${displayRows.length} project${
                    displayRows.length === 1 ? "" : "s"
                  }`)}
          </div>
        )}
      </div>
    </div>
  );
}
