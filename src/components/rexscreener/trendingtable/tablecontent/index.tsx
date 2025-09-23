/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type UIEvent,
} from "react";
import {
  useTrendingTokens,
  type TrendingToken,
} from "@/hooks/useTrendingTokens";
import { TableHeader } from "./TableHeader";
import { TableRow } from "./TableRow";
import DexscreenerView from "./DexscreenerView";
import PageLoaderOverlay from "@/components/PageLoaderOverlay";
import { ChevronDown, Check } from "lucide-react";

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
        className="flex items-center justify-between gap-2 w-[112px] px-3 py-1.5 rounded-md border border-white/20 bg-black/30 hover:bg-white/10 transition text-white"
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
          className={`absolute z-50 ${popPos} left-0 w-[160px] max-h-60 overflow-auto rounded-lg border border-white/15 bg-[#0A0A0A]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0A0A0A]/70 shadow-2xl`}
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

/* ============================ Main Component ============================ */

interface TrendingTableContentProps {
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
  isAdmin: boolean;
  /**
   * Callback fired when a user enters or exits the DexScreener
   * chart view.
   *
   * token       – full TrendingToken object, or `null` when exiting
   * address     – contract address of the token, or `null` when exiting
   * isViewing   – `true` when chart view is opened, `false` when closed
   */
  onTokenSelect?: (
    token: TrendingToken | null,
    address: string | null,
    isViewing: boolean
  ) => void;
}

export function TrendingTableContent({
  onReportGenerated,
  currentUserId,
  isAdmin,
  onTokenSelect,
}: TrendingTableContentProps) {
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
  } = useTrendingTokens();

  const rows = Array.isArray(data) ? data : [];

  const [selectedForChart, setSelectedForChart] = useState<{
    token: TrendingToken;
    address: string;
    title: string;
  } | null>(null);

  const handleOpenChart = (t: TrendingToken) => {
    const addr = t?.tokenAddress || "";
    if (!addr) return;
    const title = `${t?.name ?? t?.symbol ?? "Token"} / SOL`;
    setSelectedForChart({ token: t, address: addr, title });
    // inform parent that chart view is now active for this token
    onTokenSelect?.(t, addr, true);
  };

  const handleBackFromChart = () => {
    // notify parent we are leaving chart view
    onTokenSelect?.(null, null, false);
    setSelectedForChart(null);
  };

  // --- Refs
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
  }, [rows.length, sortField, sortDirection, pageSize, pageIndex]);

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
    if (selectedForChart === null) {
      setReady(false);
      deferredMeasure();
      const t = setTimeout(deferredMeasure, 60);
      return () => clearTimeout(t);
    }
  }, [selectedForChart, deferredMeasure]);

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
  };

  const onMainScroll = (e: UIEvent<HTMLDivElement>) => {
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
  };

  // --- NEW: Centered overlay visibility (non-scrolling)
  const showCenteredOverlay = (isLoading && rows.length === 0) || isError;

  if (selectedForChart) {
    return (
      <DexscreenerView
        token={selectedForChart.token}
        tokenAddress={selectedForChart.address}
        title={selectedForChart.title}
        onBack={handleBackFromChart}
        currentUserId={currentUserId}
        onReportGenerated={onReportGenerated}
      />
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="relative h-[calc(100vh-250px)] lg:h-[calc(100vh-250px)] border border-white/10">
        {isPageLoading && <PageLoaderOverlay />}

        {/* Centered overlay that stays put while scrolling */}
        {showCenteredOverlay && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg shadow-2xl text-[#FFC000]">
              {isLoading && rows.length === 0 && (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3" />
                  <span>Loading trending tokens…</span>
                </div>
              )}
              {isError && (
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

        {/* Always-visible top scrollbar */}
        <div
          ref={topScrollRef}
          className={`sticky top-0 z-10 custom-hscroll-top bg-black/0 h-[16px] overflow-x-scroll overflow-y-hidden ${
            ready ? "" : "pointer-events-none opacity-80"
          }`}
          onScroll={onTopScroll}
          aria-hidden="true"
          style={{ scrollbarGutter: "stable both-edges" as any }}
        >
          <div style={{ width: ghostWidth, height: 1 }} />
        </div>

        {/* Main scrollable table area */}
        <div
          ref={mainScrollRef}
          className="relative h-[calc(100%-16px)] overflow-y-auto overflow-x-auto hide-vert-scroll hide-bottom-hscroll"
          onScroll={onMainScroll}
        >
          <div
            ref={contentRef}
            className="min-w-[1160px] sm:min-w-[1260px] align-top w-full"
          >
            <TableHeader
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={onSort}
            />

            {/* Removed in-flow loading/error so they don't scroll.
                Keep 'No data' as an in-flow empty state. */}
            {!isLoading && !isError && rows.length === 0 && (
              <div className="p-4 text-white/70">No data found.</div>
            )}

            {!isLoading && !isError && rows.length > 0 && (
              <div className="divide-y divide-white/10 w-full min-w-[1040px] sm:min-w-[1140px]">
                {rows.map((t, i) => (
                  <TableRow
                    key={t.tokenAddress ?? `${t.symbol ?? "row"}-${i}`}
                    token={t}
                    rank={t._rank ?? (pageIndex - 1) * pageSize + i + 1}
                    onReportGenerated={onReportGenerated}
                    onOpenChart={handleOpenChart}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Pagination + Totals */}
      <div className="flex flex-col gap-2 text-sm text-white/80 px-2">
        <div className="flex items-center gap-3">
          <button
            className={`px-3 py-1 rounded border border-white/20 ${
              hasPrev ? "hover:bg-white/10" : "opacity-40 cursor-not-allowed"
            }`}
            onClick={prevPage}
            disabled={!hasPrev}
          >
            Prev
          </button>

          <div className="flex items-center gap-2">
            <span>Page</span>

            {/* KEEP INPUT — styled like your select (glassy, gold focus). Also hides spinners cross-browser */}
            <input
              type="number"
              min={1}
              value={pageIndex}
              onChange={(e) => setPageIndex(Number(e.target.value))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="1"
              className="w-20 px-3 py-1.5 text-sm rounded-md bg-black/30 border border-white/20 text-white placeholder-white/40 outline-none
                         focus:border-[#FFD700]/60 focus:ring-2 focus:ring-[#FFD700]/50 transition
                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />

            {totalPages ? (
              <span className="text-white/60">of {totalPages}</span>
            ) : null}
          </div>

          <button
            className={`px-3 py-1 rounded border border-white/20 ${
              hasNext ? "hover:bg-white/10" : "opacity-40 cursor-not-allowed"
            }`}
            onClick={nextPage}
            disabled={!hasNext}
          >
            Next
          </button>

          <label className="flex items-center gap-2">
            <span>Rows per page</span>
            {/* Styled, up-opening select */}
            <RowsPerPageSelect
              value={pageSize}
              onChange={(n) => setPageSize(Number(n))}
              options={[25, 50]}
              direction="up"
              className="ml-1"
            />
          </label>

          <div className="ml-auto flex items-center gap-3">
            {typeof upstreamTotal === "number" && (
              <span className="text-white/40">
                Total: {upstreamTotal.toLocaleString()} (
                {typeof jupVerifiedTotal === "number" && (
                  <span className="text-white/60">
                    Jupiter Verified Tokens: {jupVerifiedTotal.toLocaleString()}
                  </span>
                )}
                )
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
