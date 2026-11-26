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
  type SortField,
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
import { ChainButtons } from "./ChainButtons";
import clsx from "clsx";
import { useGenerateRexReport } from "@/hooks/useGenerateRexReport";
import { goldenRegistryKeyFromTrendingToken } from "@/lib/goldenReportRegistryMatch";
import {
  hasUsableTokenCreatedAt,
  mergeScreenerTokenAges,
} from "@/utils/tokenAge";
import {
  applyScreenerRowRichCache,
  mergeScreenerTokenMarket,
} from "@/utils/screenerRowMerge";

/* ============================ Pager ============================ */

const SCREENER_PAGE_SIZES = [25, 50];

/** Up to 7 slots: first and last always, the current page with its neighbours, "…" for gaps. */
function pageSlots(cur: number, last: number): (number | "gap")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "gap", last];
  if (cur >= last - 3)
    return [1, "gap", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "gap", cur - 1, cur, cur + 1, "gap", last];
}

type ScreenerPagerProps = {
  page: number;
  pageSize: number;
  /** Total rows when the API reports it; otherwise pages are open-ended (Previous / Next only). */
  total?: number;
  totalPages?: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
};

/**
 * Shared pagination (RaptorX design `.pgr`): "Show N per page" on the left, only when there are
 * more rows than the smallest option; Previous · 1 2 3 … N · Next on the right ("Page X of N" on
 * phones). Hidden when everything fits on one page.
 */
function ScreenerPager({
  page,
  pageSize,
  total,
  totalPages,
  hasPrev,
  hasNext,
  onPage,
  onSize,
}: ScreenerPagerProps) {
  const last =
    typeof totalPages === "number" && totalPages > 0 ? totalPages : null;
  const multi = hasPrev || hasNext || (last ?? 1) > 1;
  const moreThanSmallest =
    typeof total === "number" ? total > SCREENER_PAGE_SIZES[0] : multi;
  if (!multi && !moreThanSmallest) return null;
  const cur = last ? Math.min(Math.max(1, page), last) : Math.max(1, page);

  const chevron = (d: string) => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <nav className="rx-pgr" aria-label="RexScreener pages">
      {moreThanSmallest ? (
        <label className="rx-pgr__size">
          <span className="rx-pgr__label">Show</span>
          <span className="rx-pgr__sel">
            <select
              value={pageSize}
              onChange={(e) => onSize(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {SCREENER_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="rx-pgr__label">per page</span>
        </label>
      ) : (
        <span />
      )}
      {multi ? (
        <div className="rx-pgr__nav">
          <button
            type="button"
            className="rx-btn rx-btn--secondary rx-btn--s rx-pgr__step"
            onClick={() => onPage(cur - 1)}
            disabled={!hasPrev}
          >
            {chevron("M15 6l-6 6 6 6")}
            <span>Previous</span>
          </button>
          {last ? (
            <ol className="rx-pgr__pages">
              {pageSlots(cur, last).map((n, i) =>
                n === "gap" ? (
                  <li
                    key={`gap-${i}`}
                    className="rx-pgr__gap"
                    aria-hidden="true"
                  >
                    …
                  </li>
                ) : (
                  <li key={n}>
                    <button
                      type="button"
                      className="rx-pgr__num rx-num"
                      onClick={() => onPage(n)}
                      aria-current={n === cur ? "page" : undefined}
                      aria-label={`Page ${n}${n === last ? ", last page" : ""}`}
                    >
                      {n}
                    </button>
                  </li>
                ),
              )}
            </ol>
          ) : null}
          <span
            className={clsx(
              "rx-pgr__mobile rx-num",
              !last && "rx-pgr__mobile--always",
            )}
            aria-live="polite"
          >
            Page {cur.toLocaleString("en-US")}
            {last ? ` of ${last.toLocaleString("en-US")}` : ""}
          </span>
          <button
            type="button"
            className="rx-btn rx-btn--secondary rx-btn--s rx-pgr__step"
            onClick={() => onPage(cur + 1)}
            disabled={!hasNext}
          >
            <span>Next</span>
            {chevron("M9 6l6 6-6 6")}
          </button>
        </div>
      ) : null}
    </nav>
  );
}

const GOLDEN_REPORTS_INFO_TEXT =
  "Golden Reports are a special category where projects with hardworking teams, strong culture, potential, and relevance are listed. Reports generated for these projects include an exclusive “Team Updates” section, where teams share the latest updates on what they’re building and the moves they’re making.";

const PUMP_REPORTS_INFO_TEXT =
  "Volatile projects with great potential backed by up-and-coming teams. Claw AI 5.0 gives real-time intel & reporting on all Pump listed tokens.";

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
              "pointer-events-none w-max max-w-[min(320px,calc(100vw-24px))]",
              "rounded-xl border border-rx-line-strong bg-[#1D1C1B] px-3.5 py-3 text-left text-[13px] leading-normal text-rx-text shadow-[var(--rx-depth-3)]",
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

/* ============================ Toolbar pieces ============================ */

type ReportShortcutProps = {
  variant: "golden" | "pump";
  active: boolean;
  pillRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave: () => void;
  describedBy?: string;
};

/**
 * Golden / Pump Reports filter toggle. The info mark sits in the right 20% of the button,
 * which is the zone the existing click / hover handlers treat as "show the explainer".
 */
function ReportShortcut({
  variant,
  active,
  pillRef,
  buttonRef,
  onPointerDown,
  onClick,
  onPointerMove,
  onPointerLeave,
  describedBy,
}: ReportShortcutProps) {
  const golden = variant === "golden";
  const label = golden ? "Golden Reports" : "Pump Reports";
  return (
    <div ref={pillRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={onPointerDown}
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        title={`Show tokens in the ${label} program`}
        aria-pressed={active}
        aria-label={`${label} filter`}
        aria-describedby={describedBy}
        className={clsx(
          "group/sc relative isolate flex h-11 w-full min-w-0 items-center gap-1.5 rounded-xl border pl-1 pr-1 md:gap-2 md:pr-1.5 text-left transition-[filter,box-shadow,border-color] duration-150 hover:brightness-[1.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi md:w-auto",
          golden
            ? "border-[#8A6614] bg-[linear-gradient(180deg,#3A2A07,#1A1305)] shadow-[inset_0_1px_0_rgba(255,226,150,0.25),0_0_0_1px_rgba(255,184,0,0.08),0_8px_24px_rgba(255,170,0,0.14)]"
            : "border-[#2C8A5C] bg-[linear-gradient(180deg,#0E3322,#08190F)] shadow-[inset_0_1px_0_rgba(160,255,200,0.2),0_0_0_1px_rgba(69,227,163,0.08),0_8px_24px_rgba(69,227,163,0.12)]",
          active &&
            (golden
              ? "border-rx-gold-hi shadow-[inset_0_1px_0_rgba(255,226,150,0.25),0_0_0_2px_rgba(255,209,92,0.55),0_8px_24px_rgba(255,170,0,0.22)]"
              : "border-rx-up shadow-[inset_0_1px_0_rgba(160,255,200,0.2),0_0_0_2px_rgba(69,227,163,0.5),0_8px_24px_rgba(69,227,163,0.2)]"),
        )}
      >
        <span
          className={clsx("rx-sc-sweep", !golden && "rx-sc-sweep--pump")}
          aria-hidden="true"
        />
        <span className="-my-2 -ml-1 flex size-10 shrink-0 items-center justify-center md:size-11">
          <Image
            src={golden ? "/images/ic-golden.webp" : "/images/ic-pump.webp"}
            alt=""
            width={44}
            height={44}
            className="size-10 drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] md:size-11 transition-transform duration-200 group-hover/sc:-translate-y-0.5 group-hover/sc:-rotate-[4deg] group-hover/sc:scale-[1.06]"
          />
        </span>
        <span
          className={clsx(
            "min-w-0 truncate text-[12.5px] font-semibold md:text-[13.5px]",
            golden ? "text-[#FFE29A]" : "text-[#B6F5D8]",
          )}
        >
          {label}
        </span>
        <span
          className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-lg text-rx-text-3 md:size-6 transition-colors group-hover/sc:text-rx-text-2"
          aria-hidden="true"
        >
          <svg width="15" height="15" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 11v5M12 7.5v.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}

/* ============================ Golden / Pump Reports view head ============================ */

type ReportsType = "golden" | "pump";
type ReportsLayout = "list" | "cards";

const REPORTS_LAYOUT_KEY = "rx-rp-view";

const REPORTS_SORTS: { field: SortField; label: string }[] = [
  { field: "marketCap", label: "Market cap" },
  { field: "volume", label: "Volume" },
  { field: "liquidity", label: "Liquidity" },
];

function HeadIco({ d, size = 14 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const ICO_DOC = "M6 3h9l4 4v14H6zM9 12h7M9 16h5";
const ICO_TREND = "M3 17l6-6 4 4 8-8M15 7h6v6";
const ICO_LIST = "M4 7h16M4 12h16M4 17h10";
const ICO_GRID = "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z";

/**
 * Head of the Golden / Pump Reports view (design/reports.html): report type tabs with counts, the
 * program blurb, then List / Cards, the count and the sort. Tabs switch the existing Golden / Pump
 * filters; sort drives the same sort state as the table header.
 */
function ReportsViewHead({
  type,
  goldenCount,
  pumpCount,
  onSelectType,
  layout,
  onLayout,
  countLabel,
  sortField,
  sortDirection,
  onSort,
  panelId,
}: {
  type: ReportsType;
  goldenCount: number | null;
  pumpCount: number | null;
  onSelectType: (t: ReportsType) => void;
  layout: ReportsLayout;
  onLayout: (l: ReportsLayout) => void;
  countLabel: string | null;
  sortField: SortField | null;
  sortDirection: "asc" | "desc" | null;
  onSort: (field: SortField) => void;
  panelId: string;
}) {
  const tabs: { key: ReportsType; label: string; icon: string; count: number | null }[] = [
    { key: "golden", label: "Golden Reports", icon: ICO_DOC, count: goldenCount },
    { key: "pump", label: "Pump Reports", icon: ICO_TREND, count: pumpCount },
  ];
  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: ReportsType = type === "golden" ? "pump" : "golden";
    onSelectType(next);
    const btn = e.currentTarget.querySelector<HTMLButtonElement>(
      `[data-rp-type="${next}"]`,
    );
    btn?.focus();
  };
  return (
    <div className="rx-rp-head">
      <div
        className="rx-tabs rx-rp-tabs"
        role="tablist"
        aria-label="Report type"
        onKeyDown={onTabKey}
      >
        {tabs.map((t) => {
          const on = t.key === type;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${panelId}-tab-${t.key}`}
              data-rp-type={t.key}
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              className={clsx("rx-tab", on && "is-active")}
              onClick={() => onSelectType(t.key)}
            >
              <span className={clsx("rx-rp-tabs__ico", `is-${t.key}`)}>
                <HeadIco d={t.icon} />
              </span>
              {t.label}
              {t.count != null ? (
                <span
                  className={clsx(
                    "rx-badge rx-num",
                    t.key === "golden" ? "rx-badge--gold" : "rx-badge--neutral",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={clsx("rx-raised rx-rp-intro", `is-${type}`)}>
        <span className="rx-rp-intro__ico" aria-hidden="true">
          <HeadIco d={type === "golden" ? ICO_DOC : ICO_TREND} size={17} />
        </span>
        <p>{type === "golden" ? GOLDEN_REPORTS_INFO_TEXT : PUMP_REPORTS_INFO_TEXT}</p>
      </div>

      <div className="rx-rp-tools">
        <div className="rx-seg rx-rp-views" role="group" aria-label="Layout">
          {(
            [
              { key: "list", label: "List", icon: ICO_LIST },
              { key: "cards", label: "Cards", icon: ICO_GRID },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              data-rp-view={v.key}
              className={clsx("rx-seg__item", layout === v.key && "is-active")}
              aria-pressed={layout === v.key}
              aria-label={v.key === "list" ? "Screener list" : "Cards"}
              onClick={() => onLayout(v.key)}
            >
              <HeadIco d={v.icon} size={15} />
              <span>{v.label}</span>
            </button>
          ))}
        </div>
        <div className="rx-rp-tools__right">
          {countLabel ? (
            <span className="rx-rp-count rx-num" aria-live="polite">
              {countLabel}
            </span>
          ) : null}
          <div className="rx-seg rx-rp-sort" role="group" aria-label="Sort">
            {REPORTS_SORTS.map((s) => {
              const active = sortField === s.field && sortDirection !== null;
              return (
                <button
                  key={s.field}
                  type="button"
                  className={clsx("rx-seg__item", active && "is-active")}
                  aria-pressed={active}
                  title={`Sort by ${s.label}`}
                  aria-label={`Sort by ${s.label}${
                    active
                      ? sortDirection === "asc"
                        ? ", low to high"
                        : ", high to low"
                      : ""
                  }`}
                  onClick={() => onSort(s.field)}
                >
                  {s.label}
                  {active ? (
                    <HeadIco
                      d={sortDirection === "asc" ? "M8 14l4-4 4 4" : "M8 10l4 4 4-4"}
                      size={12}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TableEmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
      <div className="font-display text-[17px] font-bold text-rx-text [font-stretch:112%]">
        {title}
      </div>
      {body ? (
        <div className="max-w-[320px] text-[13px] text-rx-text-2">{body}</div>
      ) : null}
      {children}
    </div>
  );
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
  const isRobinhoodChain = lowerChainId === "robinhood";
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
        : isRobinhoodChain
          ? ((t as { quoteSymbol?: string })?.quoteSymbol || "ETH")
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
  const [pendingChartToken, setPendingChartToken] =
    useState<TrendingToken | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchType, setSearchType] = useState<"ticker" | "address" | null>(
    null
  );
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [goldenReportsOnly, setGoldenReportsOnly] = useState(false);
  const [pumpReportsOnly, setPumpReportsOnly] = useState(false);
  const [reportListsPrefetchReady, setReportListsPrefetchReady] =
    useState(false);

  /** Golden / Pump Reports: List (screener rows) or Cards, remembered per browser like the design. */
  const [reportsLayout, setReportsLayout] = useState<ReportsLayout>("cards");
  const reportsPanelId = useId().replace(/:/g, "");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(REPORTS_LAYOUT_KEY);
      if (v === "list" || v === "cards") setReportsLayout(v);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const chooseReportsLayout = useCallback((v: ReportsLayout) => {
    setReportsLayout(v);
    try {
      window.localStorage.setItem(REPORTS_LAYOUT_KEY, v);
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  }, []);

  // Warm Golden/Pump lists after the main table starts, so a later tab click
  // is usually a cache hit. Clicking the tab still fetches immediately.
  useEffect(() => {
    const t = window.setTimeout(() => setReportListsPrefetchReady(true), 800);
    return () => window.clearTimeout(t);
  }, []);

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
    setPageIndex,
    setPageSize,

    sortField,
    sortDirection,
    onSort,

    isPageLoading,

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
    enabled: goldenReportsOnly || reportListsPrefetchReady,
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
    enabled: pumpReportsOnly || reportListsPrefetchReady,
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
    enabled: goldenBaseItems.length > 0,
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
    enabled: pumpBaseItems.length > 0,
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

  const trendingMarketQueryKey = useMemo(
    () =>
      [
        "trending-row-market",
        screenerChain,
        rows.map((t) => t.tokenAddress ?? "").join("|"),
      ] as const,
    [screenerChain, rows],
  );

  const {
    data: trendingMarketPayload,
    isFetched: trendingMarketFetched,
    isError: trendingMarketError,
  } = useQuery({
    queryKey: trendingMarketQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/trending/market", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ chain: screenerChain, items: rows }),
      });
      if (!res.ok) {
        throw new Error(`Trending market overlay failed: ${res.statusText}`);
      }
      return res.json() as Promise<{
        ok?: boolean;
        items?: TrendingToken[];
      }>;
    },
    enabled: rows.length > 0 && !goldenReportsOnly && !pumpReportsOnly,
    staleTime: 15_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const marketOverlayReady =
    goldenReportsOnly ||
    pumpReportsOnly ||
    rows.length === 0 ||
    trendingMarketFetched ||
    trendingMarketError;

  const rowsWithMarket = useMemo(
    () =>
      mergeScreenerTokenMarket(
        rows,
        trendingMarketPayload?.items,
        marketOverlayReady,
      ),
    [rows, trendingMarketPayload?.items, marketOverlayReady],
  );

  const pendingAgeItems = useMemo(() => {
    if (goldenReportsOnly || pumpReportsOnly) return [];
    return rowsWithMarket.filter((t) => !hasUsableTokenCreatedAt(t.createdAt));
  }, [goldenReportsOnly, pumpReportsOnly, rowsWithMarket]);

  const trendingAgeQueryKey = useMemo(
    () =>
      [
        "trending-row-ages",
        pendingAgeItems.map((t) => t.tokenAddress ?? "").join("|"),
      ] as const,
    [pendingAgeItems],
  );

  const { data: trendingAgesPayload } = useQuery({
    queryKey: trendingAgeQueryKey,
    queryFn: async () => {
      const res = await fetch("/api/trending/ages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ items: pendingAgeItems }),
      });
      if (!res.ok) {
        throw new Error(`Trending ages failed: ${res.statusText}`);
      }
      return res.json() as Promise<{
        ok?: boolean;
        ages?: Record<string, number | undefined>;
      }>;
    },
    enabled: pendingAgeItems.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const rowsWithAges = useMemo(
    () => mergeScreenerTokenAges(rowsWithMarket, trendingAgesPayload?.ages),
    [rowsWithMarket, trendingAgesPayload?.ages],
  );

  const displayRows = goldenReportsOnly
    ? goldenRowsWithRank
    : pumpReportsOnly
      ? pumpRowsWithRank
      : rowsWithAges;

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

    // Wait for the Dex pair so the embed matches the row's Mcap, instead of
    // opening on the token address (wrong chart) or Birdeye numbers.
    if (!t.pairAddress && !goldenReportsOnly && !pumpReportsOnly && !marketOverlayReady) {
      setPendingChartToken(t);
      return;
    }

    captureListState();
    handleClearSearch({ keepPage: true });
    onTokenSelect?.(t, addr, true);
  };

  useEffect(() => {
    if (!pendingChartToken?.tokenAddress) return;
    const key = String(pendingChartToken.tokenAddress).toLowerCase();
    const updated =
      rowsWithAges.find(
        (r) => String(r.tokenAddress ?? "").toLowerCase() === key,
      ) ?? pendingChartToken;

    if (updated.pairAddress) {
      setPendingChartToken(null);
      captureListState();
      handleClearSearch({ keepPage: true });
      onTokenSelect?.(updated, updated.tokenAddress || "", true);
      return;
    }

    if (marketOverlayReady) {
      setPendingChartToken(null);
      captureListState();
      handleClearSearch({ keepPage: true });
      onTokenSelect?.(updated, updated.tokenAddress || "", true);
    }
  }, [pendingChartToken, rowsWithAges, marketOverlayReady, onTokenSelect]);

  useEffect(() => {
    setPendingChartToken(null);
  }, [screenerChain, goldenReportsOnly, pumpReportsOnly]);

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
    // Pinned header cells (rank + token) undo the shift so they stay over the pinned row cells.
    headerContentRef.current.style.setProperty("--rx-hscroll", `${left}px`);
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

  const reportsMode = goldenReportsOnly || pumpReportsOnly;
  const showReportCards = reportsMode && reportsLayout === "cards";

  /** Golden / Pump: the count sits next to the sort in the view head ("8 reports"). */
  const reportsCountLabel = goldenReportsOnly
    ? goldenTableStillLoading
      ? null
      : `${displayRows.length} report${displayRows.length === 1 ? "" : "s"}`
    : pumpReportsOnly
      ? pumpTableStillLoading
        ? null
        : `${displayRows.length} report${displayRows.length === 1 ? "" : "s"}`
      : null;

  const tableCountLabel = reportsMode
    ? null
    : isLoading && rows.length === 0
      ? null
      : `${displayRows.length} token${displayRows.length === 1 ? "" : "s"}`;

  /** Tab badges: the loaded list when we have it, else the registry size. */
  const goldenTabCount = Array.isArray(goldenScreenerPayload?.items)
    ? goldenBaseItems.length
    : goldenRegistryCount > 0
      ? goldenRegistryCount
      : null;
  const pumpTabCount = Array.isArray(pumpScreenerPayload?.items)
    ? pumpBaseItems.length
    : pumpRegistryCount > 0
      ? pumpRegistryCount
      : null;

  const selectReportsType = (t: ReportsType) => {
    if (t === "golden" && !goldenReportsOnly) toggleGoldenReports();
    if (t === "pump" && !pumpReportsOnly) togglePumpReports();
  };

  /* Pinned rank + token columns only turn opaque while the table actually scrolls sideways. */
  const pinStyle = {
    "--rx-pin-bg": hasHorizontalOverflow ? "#0C0C0C" : "transparent",
    "--rx-pin-bg-hover": hasHorizontalOverflow ? "#14110C" : "transparent",
    "--rx-pin-head-bg": hasHorizontalOverflow ? "#0C0C0C" : "transparent",
    "--rx-pin-shadow": hasHorizontalOverflow
      ? "inset -1px 0 0 var(--rx-line), 10px 0 14px -12px rgba(0,0,0,.9)"
      : "none",
  } as CSSProperties;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
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

      {/* Toolbar: search + Golden/Pump on the left, count + chain switcher on the right */}
      <div className="mx-[var(--rx-gutter)] flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-rx-line-strong pb-3 pt-4 md:pt-[22px]">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 md:w-auto">
          <TokenSearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            className="md:w-[270px] md:flex-none min-[1536px]:w-[300px]"
          />
          <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
            <ReportShortcut
              variant="golden"
              active={goldenReportsOnly}
              pillRef={goldenReportsPillDesktopRef}
              buttonRef={goldenReportImageBtnDesktopRef}
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
              describedBy={
                goldenReportsInfoOpen ? goldenReportsTooltipId : undefined
              }
            />
            <ReportShortcut
              variant="pump"
              active={pumpReportsOnly}
              pillRef={pumpReportsPillDesktopRef}
              buttonRef={pumpReportImageBtnDesktopRef}
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
              describedBy={
                pumpReportsInfoOpen ? pumpReportsTooltipId : undefined
              }
            />
          </div>
        </div>

        <div className="flex w-full min-w-0 items-center gap-3 md:ml-auto md:w-auto">
          {tableCountLabel ? (
            <div
              className="rx-num hidden shrink-0 text-[13px] text-rx-text-3 md:block"
              aria-live="polite"
            >
              {tableCountLabel}
            </div>
          ) : null}
          <ChainButtons
            selectedChain={screenerChain}
            onChainChange={handleScreenerChainNavigate}
          />
        </div>
      </div>

      <div
        className="rexscreener-trending-table-frame relative flex min-h-0 flex-1 flex-col overflow-hidden touch-manipulation md:mx-[var(--rx-gutter)]"
        style={pinStyle}
      >
        {isPageLoading &&
          !goldenReportsOnly &&
          !pumpReportsOnly &&
          !deepLinkBlocksTrendingLoaders && <PageLoaderOverlay />}

        {pendingChartToken && (
          <div className="absolute inset-0 z-[19] flex items-center justify-center bg-[rgba(7,7,7,0.6)] backdrop-blur-[2px]">
            <div className="flex items-center gap-3 text-sm text-rx-text-2" role="status">
              <span className="rx-spin text-rx-gold" aria-hidden />
              <span>Loading chart…</span>
            </div>
          </div>
        )}

        {deepLinkTableOverlay !== null && !suppressDeepLinkTableOverlay && (
          <div className="absolute inset-0 z-[18] flex items-center justify-center bg-[rgba(7,7,7,0.6)] backdrop-blur-[2px]">
            {deepLinkTableOverlay === "loading" && (
              <div className="flex items-center gap-3 text-sm text-rx-text-2" role="status">
                <span className="rx-spin text-rx-gold" aria-hidden />
                <span>Loading token…</span>
              </div>
            )}
            {deepLinkTableOverlay === "not-found" && (
              <div className="flex flex-col items-center gap-4 px-4 text-center">
                <p className="text-[15px] text-rx-text">
                  We couldn&apos;t load this token from the URL.
                </p>
                <button
                  type="button"
                  onClick={() => onScreenerChainNavigate(screenerChain)}
                  className="rx-btn rx-btn--secondary rx-btn--s"
                >
                  Back to screener
                </button>
              </div>
            )}
          </div>
        )}

        {showCenteredOverlay && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="pointer-events-auto text-sm text-rx-text-2">
              {goldenReportsOnly && goldenTableStillLoading && (
                <div className="flex items-center gap-3" role="status">
                  <span className="rx-spin text-rx-gold" aria-hidden />
                  <span>Loading Golden Reports…</span>
                </div>
              )}
              {goldenReportsOnly && goldenScreenerError && (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <span className="text-rx-down">
                    {(goldenScreenerErr as Error)?.message ?? "Failed to load"}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchGoldenScreener()}
                    className="rx-btn rx-btn--secondary rx-btn--s"
                  >
                    Retry
                  </button>
                </div>
              )}
              {pumpReportsOnly && pumpTableStillLoading && (
                <div className="flex items-center gap-3" role="status">
                  <span className="rx-spin text-rx-gold" aria-hidden />
                  <span>Loading Pump Reports…</span>
                </div>
              )}
              {pumpReportsOnly && pumpScreenerError && (
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <span className="text-rx-down">
                    {(pumpScreenerErr as Error)?.message ?? "Failed to load"}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetchPumpScreener()}
                    className="rx-btn rx-btn--secondary rx-btn--s"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!goldenReportsOnly && !pumpReportsOnly && isLoading && rows.length === 0 && (
                <div className="flex items-center gap-3" role="status">
                  <span className="rx-spin text-rx-gold" aria-hidden />
                  <span>Loading trending tokens…</span>
                </div>
              )}
              {!goldenReportsOnly && !pumpReportsOnly && isError && (
                <div className="flex flex-col items-center gap-3 px-4 text-center sm:flex-row">
                  <span className="text-rx-down">
                    Failed to load. {(error as Error)?.message ?? ""}
                  </span>
                  <button
                    onClick={() => refetch()}
                    className="rx-btn rx-btn--secondary rx-btn--s"
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
          {reportsMode ? (
            <ReportsViewHead
              type={goldenReportsOnly ? "golden" : "pump"}
              goldenCount={goldenTabCount}
              pumpCount={pumpTabCount}
              onSelectType={selectReportsType}
              layout={reportsLayout}
              onLayout={chooseReportsLayout}
              countLabel={reportsCountLabel}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={onSort}
              panelId={reportsPanelId}
            />
          ) : null}

          {/* Column header: the list only (cards carry their own labels) */}
          <div
            className="sticky top-0 z-40 overflow-hidden bg-[rgba(9,9,9,0.86)] backdrop-blur-md"
            hidden={showReportCards}
          >
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
            <div
              ref={contentRef}
              className="w-full align-top"
              {...(reportsMode
                ? {
                    role: "tabpanel",
                    id: reportsPanelId,
                    "aria-labelledby": `${reportsPanelId}-tab-${goldenReportsOnly ? "golden" : "pump"}`,
                  }
                : {})}
            >
              {!goldenReportsOnly &&
                !pumpReportsOnly &&
                !isLoading &&
                !isError &&
                displayRows.length === 0 && (
                  <TableEmptyState
                    title="No tokens found"
                    body={
                      isSearchMode
                        ? "Check the ticker, or paste the full contract address."
                        : "Nothing is trending on this chain right now."
                    }
                  />
                )}

              {goldenReportsOnly &&
                goldenFetchSettled &&
                !goldenTableStillLoading &&
                !goldenScreenerError &&
                !goldenMetadataGap &&
                goldenRegistryCount === 0 && (
                  <TableEmptyState title="No Golden Report projects yet." />
                )}

              {goldenReportsOnly && goldenMetadataGap && (
                <TableEmptyState title="Couldn't load market data for Golden Reports.">
                  <button
                    type="button"
                    onClick={() => refetchGoldenScreener()}
                    className="rx-btn rx-btn--secondary rx-btn--s"
                  >
                    Retry
                  </button>
                </TableEmptyState>
              )}

              {pumpReportsOnly &&
                pumpFetchSettled &&
                !pumpTableStillLoading &&
                !pumpScreenerError &&
                !pumpMetadataGap &&
                pumpRegistryCount === 0 && (
                  <TableEmptyState title="No Pump Report projects yet." />
                )}

              {pumpReportsOnly && pumpMetadataGap && (
                <TableEmptyState title="Couldn't load market data for Pump Reports.">
                  <button
                    type="button"
                    onClick={() => refetchPumpScreener()}
                    className="rx-btn rx-btn--secondary rx-btn--s"
                  >
                    Retry
                  </button>
                </TableEmptyState>
              )}

              {(goldenReportsOnly
                ? !goldenTableStillLoading && !goldenScreenerError
                : pumpReportsOnly
                  ? !pumpTableStillLoading && !pumpScreenerError
                  : !isLoading && !isError) &&
                displayRows.length > 0 &&
                showReportCards && (
                  <ul className="rx-rp-grid" aria-label={goldenReportsOnly ? "Golden Reports" : "Pump Reports"}>
                    {displayRows.map((t, i) => {
                      const sk = trendSparklineCacheKey(t);
                      return (
                        <TableRow
                          key={t.tokenAddress ?? `${t.symbol ?? "card"}-${i}`}
                          layout="card"
                          cardKind={goldenReportsOnly ? "golden" : "pump"}
                          token={t}
                          rank={t._rank ?? i + 1}
                          generateFromToken={generateFromToken}
                          adminGenerateAndStoreFromToken={
                            adminGenerateAndStoreFromToken
                          }
                          onOpenChart={handleOpenChart}
                          currentUserId={currentUserId}
                          isAdmin={isAdmin}
                          index={i}
                          showChainBadge
                          sparklineY={
                            sk && sparklineSeries[sk]?.length
                              ? sparklineSeries[sk]
                              : undefined
                          }
                          sparklinesFetching={sparklinesFetching}
                          useGoldenGenerateArt={goldenReportsOnly}
                          usePumpGenerateArt={pumpReportsOnly}
                          ageLoading={
                            (goldenAgesLoading || pumpAgesLoading) &&
                            !hasUsableTokenCreatedAt(t.createdAt)
                          }
                          marketLoading={false}
                        />
                      );
                    })}
                  </ul>
                )}

              {(goldenReportsOnly
                ? !goldenTableStillLoading && !goldenScreenerError
                : pumpReportsOnly
                  ? !pumpTableStillLoading && !pumpScreenerError
                  : !isLoading && !isError) &&
                displayRows.length > 0 &&
                !showReportCards && (
                <div className="w-full">
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
                        marketLoading={
                          !goldenReportsOnly &&
                          !pumpReportsOnly &&
                          !marketOverlayReady &&
                          !t.pairAddress
                        }
                      />
                    );
                  })}
                  {/* Room for the floating Ask Claw button below the last row */}
                  <div aria-hidden="true" className="hidden h-16 md:block" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pager (shared .rx-pgr): hidden when everything fits on one page */}
      {!goldenReportsOnly && !pumpReportsOnly ? (
        displayRows.length > 0 ? (
          <div className="shrink-0 px-[var(--rx-gutter)] py-2.5">
            <ScreenerPager
              page={pageIndex}
              pageSize={pageSize}
              total={
                typeof totalPages === "number"
                  ? totalPages > 1
                    ? totalPages * pageSize
                    : displayRows.length
                  : undefined
              }
              totalPages={totalPages}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPage={(n) => setPageIndex(n)}
              onSize={(n) => setPageSize(n)}
            />
          </div>
        ) : null
      ) : null}
      {/* Golden / Pump: the count lives in the view head, next to the sort. */}
    </div>
  );
}
