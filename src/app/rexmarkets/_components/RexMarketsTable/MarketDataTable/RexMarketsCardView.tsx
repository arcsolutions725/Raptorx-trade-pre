/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  memo,
  type MouseEvent,
} from "react";
import Image from "next/image";
import clsx from "clsx";
import type { KalashiMarket } from "@/hooks/useKalashiMarkets";
import type { PolymarketMarket } from "@/hooks/usePolymarketMarkets";
import type { LimitlessMarket } from "@/hooks/useLimitlessMarkets";
import { useGenerateMarketReport } from "@/hooks/useGenerateMarketReport";
import { usePrivy } from "@privy-io/react-auth";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useEventMetadata } from "@/hooks/useEventMetadata";
import { useDataSource } from "@/contexts/DataSourceContext";
import { PaywallModal } from "@/components/ui/modal/PaywallModal";
import { getMarketReportGenKey } from "@/lib/rexmarkets/marketRoutes";
import { PREDICT_FUN_LOGO_SRC } from "@/lib/predictfun/assets";

/** Listing rows: Kalshi has no `id`; Polymarket/Limitless do. Optional `id` covers all union members. */
type MarketWithSource = (KalashiMarket | PolymarketMarket | LimitlessMarket) & {
  _source?: "kalshi" | "polymarket" | "limitless" | "myriad" | "predictfun";
  id?: string;
};

function formatVol24(market: MarketWithSource, source: string): string {
  let v: number | undefined;
  if (source === "kalshi") {
    v = (market as KalashiMarket).volume_24h;
  } else {
    v = (market as PolymarketMarket | LimitlessMarket).volume24hr;
  }
  if (typeof v !== "number" || v <= 0) {
    if (source === "limitless") {
      const fmt = (market as LimitlessMarket).volumeFormatted;
      if (fmt) return fmt;
    }
    return "—";
  }
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(0)}`;
}

function parseYesNoPercent(
  market: MarketWithSource,
  source: string,
  isBinary: boolean,
): { yes: number | null; no: number | null } {
  if (!isBinary) return { yes: null, no: null };
  if (source === "kalshi") {
    const k = market as KalashiMarket;
    const y = k.yes_bid ?? k.yes_price;
    const n = k.no_ask ?? k.no_price;
    if (typeof y === "number" && typeof n === "number") {
      return { yes: y * 100, no: n * 100 };
    }
    return { yes: null, no: null };
  }
  const pm = market as PolymarketMarket | LimitlessMarket;
  const parseP = (v: string | number) => {
    if (v === "—") return null;
    const num = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(num) ? num : null;
  };
  return {
    yes: parseP(pm.yesPrice),
    no: parseP(pm.noPrice),
  };
}

function normalizeImpliedSplit(
  yes: number | null,
  no: number | null,
): {
  yesPct: number;
  noPct: number;
} {
  if (yes != null && no != null && yes + no > 0) {
    const sum = yes + no;
    return { yesPct: (yes / sum) * 100, noPct: (no / sum) * 100 };
  }
  if (yes != null) {
    const clamped = Math.min(100, Math.max(0, yes));
    return { yesPct: clamped, noPct: 100 - clamped };
  }
  if (no != null) {
    const clamped = Math.min(100, Math.max(0, no));
    return { yesPct: 100 - clamped, noPct: clamped };
  }
  return { yesPct: 50, noPct: 50 };
}

function ProbabilityBar({
  yesPct,
  noPct,
  yesLabel,
  noLabel,
}: {
  yesPct: number;
  noPct: number;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-bold tabular-nums tracking-wide">
        <span className="text-emerald-400">Yes {yesLabel}</span>
        <span className="text-red-400">No {noLabel}</span>
      </div>
      <div
        className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-black/35 ring-1 ring-white/[0.08]"
        role="img"
        aria-label={`Implied probability ${yesLabel} yes versus ${noLabel} no`}
      >
        <div className="absolute inset-0 flex">
          <div
            className="h-full shrink-0 bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${yesPct}%` }}
          />
          <div
            className="h-full shrink-0 bg-red-500 transition-[width] duration-300 ease-out"
            style={{ width: `${noPct}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[9px] font-medium uppercase tracking-[0.14em] text-white/40">
        <span>Implied</span>
        <span>Live mix</span>
      </div>
    </div>
  );
}

type OutcomeRowItem = {
  key: string;
  label: string;
  yesPct: number | null;
  noPct: number | null;
};

/**
 * Match /api/polymarket/market-details: outcomePrices first, then bid/ask mid, then lastTradePrice.
 * Listing cards used to prefer lastTradePrice, which is often stale vs outcomePrices (e.g. 100% vs 0%).
 */
function parsePolymarketSubMarketPrices(m: any): {
  yesPct: number | null;
  noPct: number | null;
} {
  let outcomePrices: string[] = [];
  try {
    if (typeof m?.outcomePrices === "string") {
      outcomePrices = JSON.parse(m.outcomePrices);
    } else if (Array.isArray(m?.outcomePrices)) {
      outcomePrices = m.outcomePrices;
    }
  } catch {
    outcomePrices = [];
  }

  const to01 = (raw: number): number | null => {
    if (!Number.isFinite(raw) || raw < 0) return null;
    if (raw <= 1) return raw;
    if (raw <= 100) return raw / 100;
    return null;
  };

  const toDisplayPct = (p01: number | null): number | null =>
    p01 == null ? null : Math.min(100, Math.max(0, p01 * 100));

  let yes01: number | null = null;
  let no01: number | null = null;

  if (outcomePrices.length >= 2) {
    const py = parseFloat(String(outcomePrices[0]));
    const pn = parseFloat(String(outcomePrices[1]));
    if (!isNaN(py) && !isNaN(pn) && py >= 0 && pn >= 0) {
      yes01 = to01(py);
      no01 = to01(pn);
    } else if (!isNaN(py) && py >= 0) {
      yes01 = to01(py);
      if (yes01 != null) no01 = 1 - yes01;
    }
  } else if (outcomePrices.length === 1) {
    const py = parseFloat(String(outcomePrices[0]));
    if (!isNaN(py) && py >= 0) {
      yes01 = to01(py);
      if (yes01 != null) no01 = 1 - yes01;
    }
  }

  const bestBid = Number(m?.bestBid ?? 0) || 0;
  const bestAsk = Number(m?.bestAsk ?? 0) || 0;
  if (yes01 == null && bestBid > 0 && bestAsk > 0) {
    const bid01 = bestBid <= 1 ? bestBid : bestBid / 100;
    const ask01 = bestAsk <= 1 ? bestAsk : bestAsk / 100;
    const mid = (bid01 + ask01) / 2;
    yes01 = mid >= 0 && mid <= 1 ? mid : null;
    if (yes01 != null) no01 = 1 - yes01;
  }

  if (yes01 == null && m?.lastTradePrice != null && m?.lastTradePrice !== "") {
    const v = parseFloat(String(m.lastTradePrice));
    if (Number.isFinite(v) && v >= 0) {
      yes01 = to01(v);
      if (yes01 != null) no01 = 1 - yes01;
    }
  }

  return {
    yesPct: toDisplayPct(yes01),
    noPct: toDisplayPct(no01),
  };
}

function parseSubMarketYesProb(m: any): number | null {
  return parsePolymarketSubMarketPrices(m).yesPct;
}

function subMarketLabel(m: any, idx: number): string {
  const raw =
    m?.groupItemTitle ||
    m?.subtitle ||
    (Array.isArray(m?.outcomes) && m.outcomes.length
      ? String(m.outcomes[0])
      : null) ||
    m?.question ||
    m?.title;
  if (raw && String(raw).trim()) return String(raw).trim();
  return `Outcome ${idx + 1}`;
}

function buildPolymarketLimitlessRows(markets: any[]): OutcomeRowItem[] {
  // Highest implied Yes % first (matches “top outcomes”), then volume as tiebreaker
  const sorted = [...markets].sort((a: any, b: any) => {
    const pa = parseSubMarketYesProb(a);
    const pb = parseSubMarketYesProb(b);
    const na = pa ?? -1;
    const nb = pb ?? -1;
    if (nb !== na) return nb - na;
    const va = Number(
      a?.volume24hr ?? a?.volume ?? a?.volumeClob ?? a?.liquidity ?? 0,
    );
    const vb = Number(
      b?.volume24hr ?? b?.volume ?? b?.volumeClob ?? b?.liquidity ?? 0,
    );
    return vb - va;
  });
  return sorted.map((m, i) => {
    const { yesPct, noPct } = parsePolymarketSubMarketPrices(m);
    return {
      key: String(m?.id ?? m?.conditionId ?? m?.slug ?? `pm-${i}`),
      label: subMarketLabel(m, i),
      yesPct,
      noPct:
        yesPct != null && noPct != null
          ? noPct
          : yesPct != null
            ? Math.min(100, Math.max(0, 100 - yesPct))
            : null,
    };
  });
}

function buildKalshiMultiRows(markets: any[]): OutcomeRowItem[] {
  const rows = markets.map((m: any, i: number) => {
    const vol = Number(m?.volume_24h ?? m?.volume ?? 0);
    const dollars =
      m?.yes_ask_dollars ?? m?.yes_bid_dollars ?? m?.last_price_dollars;
    let yesPct: number | null = null;
    if (typeof dollars === "number" && Number.isFinite(dollars)) {
      yesPct =
        dollars <= 1 && dollars >= 0
          ? dollars * 100
          : Math.min(100, Math.max(0, dollars));
    } else if (typeof m?.yes_ask === "number") {
      yesPct = m.yes_ask <= 1 ? m.yes_ask * 100 : m.yes_ask;
    }
    if (yesPct != null) {
      yesPct = Math.min(100, Math.max(0, yesPct));
    }
    const row: OutcomeRowItem = {
      key: String(m?.ticker ?? `k-${i}`),
      label: String(m?.yes_subtitle || m?.no_subtitle || `Leg ${i + 1}`),
      yesPct,
      noPct: yesPct != null ? Math.min(100, Math.max(0, 100 - yesPct)) : null,
    };
    return { row, vol };
  });
  rows.sort((a, b) => {
    const na = a.row.yesPct ?? -1;
    const nb = b.row.yesPct ?? -1;
    if (nb !== na) return nb - na;
    return b.vol - a.vol;
  });
  return rows.map((x) => x.row);
}

function OutcomeRowBar({ yesPct, noPct }: { yesPct: number; noPct: number }) {
  return (
    <div className="relative mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/35 ring-1 ring-white/[0.08]">
      <div className="absolute inset-0 flex">
        <div
          className="h-full shrink-0 bg-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="h-full shrink-0 bg-red-500 transition-[width] duration-300 ease-out"
          style={{ width: `${noPct}%` }}
        />
      </div>
    </div>
  );
}

type DenseCardProps = {
  market: MarketWithSource;
  onMarketNavigate: (m: MarketWithSource) => void;
  onMarketSelected?: (
    eventTicker: string,
    marketTitle: string,
    totalVolume: number,
    eventId?: string
  ) => void;
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
};

const MarketDenseCard = memo(function MarketDenseCard({
  market,
  onMarketNavigate,
  onMarketSelected,
  onReportGenerated,
  currentUserId,
}: DenseCardProps) {
  const { dataSource } = useDataSource();
  const source = (market as any)._source || dataSource;
  const isPolymarket = source === "polymarket";
  const isKalshi = source === "kalshi";
  const isLimitless = source === "limitless";
  const isMyriad = source === "myriad";
  const isPredictFun = source === "predictfun";
  const isLimitlessLike = isLimitless || isMyriad || isPredictFun;

  const marketsArray = market?.markets || [];
  // Polymarket / Limitless: one nested market = binary; 2+ = separate contracts (row list).
  // Kalshi: 1–2 legs often map to one traded event; 3+ = multi list.
  const showMultiOutcomeRows = useMemo(() => {
    if (!marketsArray.length) return false;
    if (isPolymarket || isLimitlessLike) return marketsArray.length >= 2;
    if (isKalshi) return marketsArray.length > 2;
    return false;
  }, [marketsArray.length, isPolymarket, isLimitlessLike, isKalshi]);

  const outcomeRows = useMemo((): OutcomeRowItem[] => {
    if (!showMultiOutcomeRows) return [];
    if (isKalshi) return buildKalshiMultiRows(marketsArray as any[]);
    return buildPolymarketLimitlessRows(marketsArray as any[]);
  }, [showMultiOutcomeRows, isKalshi, marketsArray]);

  /** Single-contract card: show combined Yes/No bar + primary buttons */
  const isBinaryCard = !showMultiOutcomeRows;

  const { generateFromMarket } = useGenerateMarketReport({
    onReportGenerated,
    userId: currentUserId,
  });

  const reportGenKey = getMarketReportGenKey(market as any);
  const { isGenerating, startedAt } = useReportGenStatus(
    reportGenKey || undefined
  );
  const [hasGenerated, setHasGenerated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { authenticated, ready, login } = usePrivy();

  const { imageUrl: metadataImageUrl } = useEventMetadata(
    isKalshi && (market as KalashiMarket)?.event_ticker
      ? (market as KalashiMarket).event_ticker
      : null,
  );
  const [imageError, setImageError] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const symbolImageUrl = useMemo(() => {
    if (isPolymarket) {
      const pm = market as PolymarketMarket;
      return pm?.image || pm?.icon || null;
    }
    if (isKalshi) {
      if (metadataImageUrl) return metadataImageUrl;
      const kal = market as KalashiMarket;
      if (kal?.series_ticker || kal?.event_ticker) {
        return `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${
          kal.series_ticker || kal.event_ticker
        }.webp?size=sm`;
      }
    }
    if (isLimitlessLike) {
      const lim = market as LimitlessMarket;
      return lim?.image || lim?.icon || null;
    }
    return null;
  }, [metadataImageUrl, market, isPolymarket, isKalshi, isLimitlessLike]);

  useEffect(() => {
    setImageError(false);
  }, [market?.ticker, symbolImageUrl]);

  useEffect(() => {
    if (isGenerating && countdown === null) {
      if (startedAt) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const remaining = 100 - (elapsed % 100);
        setCountdown(Math.max(1, remaining));
      } else {
        setCountdown(100);
      }
    } else if (!isGenerating && countdown !== null) {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setHasGenerated(true);
    }
  }, [isGenerating, startedAt, countdown]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (countdown !== null && countdown > 0 && isGenerating && reportGenKey) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return 100;
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [countdown, isGenerating, reportGenKey]);

  const openCopilotForMarket = useCallback(() => {
    if (!onMarketSelected) return;
    const key = getMarketReportGenKey(market as any);
    const vol = (market as any).volume ?? (market as any).volume24hr ?? 0;
    const eid =
      (market as any).id != null ? String((market as any).id) : undefined;
    onMarketSelected(key, market.title ?? "", vol, eid);
  }, [market, onMarketSelected]);

  const onGenerateClick = useCallback(async () => {
    openCopilotForMarket();
    try {
      await generateFromMarket(market as KalashiMarket | PolymarketMarket);
      setHasGenerated(true);
    } catch (err: any) {
      if (err?.status === 402) setShowPaywall(true);
      setCountdown(null);
      setHasGenerated(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [generateFromMarket, market, openCopilotForMarket]);

  const handleGenerateButtonClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!authenticated) login();
      else onGenerateClick();
    },
    [authenticated, login, onGenerateClick],
  );

  const handleTrade = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onMarketNavigate(market);
    },
    [onMarketNavigate, market],
  );

  const handleTitleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onMarketNavigate(market);
    },
    [onMarketNavigate, market],
  );

  const volLabel = useMemo(() => formatVol24(market, source), [market, source]);
  const { yes, no } = parseYesNoPercent(market, source, isBinaryCard);
  const { yesPct, noPct } = normalizeImpliedSplit(yes, no);

  const yesBtn =
    yes != null ? `${yes.toFixed(1)}%` : isBinaryCard ? "Trade" : "—";
  const noBtn = no != null ? `${no.toFixed(1)}%` : isBinaryCard ? "Trade" : "—";

  const volSummary = (
    <span className="min-w-0 truncate text-right text-[11px] leading-snug text-white/45 sm:text-xs">
      Vol <span className="font-medium tabular-nums text-[#ffc000]">{volLabel}</span>
    </span>
  );

  /** Match Rex header source tabs; circular badge, icon only (incl. All mode). */
  const sourceAria =
    source === "kalshi"
      ? "Kalshi"
      : source === "polymarket"
        ? "Polymarket"
        : source === "limitless"
          ? "Limitless"
          : source === "myriad"
            ? "Myriad"
            : source === "predictfun"
              ? "Predict.fun"
              : String(source);

  const platformLogo = isPolymarket ? (
    <Image
      src="/images/polymarket.png"
      alt=""
      width={32}
      height={32}
      className="h-[14px] w-[14px] shrink-0 object-contain object-center sm:h-4 sm:w-4"
    />
  ) : isLimitless ? (
    <Image
      src="/images/limitless-logo-new.webp"
      alt=""
      width={40}
      height={40}
      className="h-[18px] w-[18px] shrink-0 object-contain sm:h-5 sm:w-5"
    />
  ) : isMyriad ? (
    <Image
      src="/images/myriad.webp"
      alt=""
      width={32}
      height={32}
      className="h-[14px] w-[14px] max-w-[85%] shrink-0 object-contain sm:h-4 sm:w-4"
    />
  ) : isPredictFun ? (
    <Image
      src={PREDICT_FUN_LOGO_SRC}
      alt=""
      width={32}
      height={32}
      className="h-[14px] w-[14px] shrink-0 object-contain sm:h-4 sm:w-4"
    />
  ) : (
    <span className="shrink-0 text-xs font-bold leading-none text-white sm:text-[13px]">
      K
    </span>
  );

  const sourceBadgeClass = clsx(
    "flex size-7 shrink-0 items-center justify-center rounded-full shadow-lg transition-transform duration-300 group-hover/card:scale-105 sm:size-8",
    isPolymarket &&
      "bg-gradient-to-br from-[#4169E1] to-[#1e3a8a] shadow-[0_0_16px_rgba(65,105,225,0.45)] ring-2 ring-white/20",
    isKalshi &&
      "bg-gradient-to-br from-[#17cb91] to-[#0d7a55] shadow-[0_0_16px_rgba(23,203,145,0.4)] ring-2 ring-white/20",
    isLimitless &&
      "bg-[#c3ff01] shadow-[0_0_14px_rgba(195,255,1,0.45)] ring-2 ring-black/20",
    isMyriad &&
      "bg-gradient-to-br from-zinc-900 to-black shadow-[0_0_14px_rgba(139,92,246,0.35)] ring-2 ring-violet-400/30",
    isPredictFun &&
      "bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] shadow-[0_0_14px_rgba(168,85,247,0.45)] ring-2 ring-violet-300/30",
  );

  return (
    <>
      <div className="h-full min-h-0 min-w-0 flex flex-col">
        <div className="group/card relative h-full min-h-0 min-w-0 flex flex-1 flex-col">
          <div
            className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-br from-amber-400/35 via-fuchsia-500/15 to-cyan-400/25 opacity-30 blur-md transition-all duration-500 group-hover/card:opacity-55 group-hover/card:blur-lg"
            aria-hidden
          />
          <article
            className={clsx(
              "relative grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)]",
              "rounded-2xl border border-white/[0.1]",
              "bg-zinc-950/80 backdrop-blur-xl backdrop-saturate-150",
              "shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)]",
              "transition-all duration-300 ease-out",
              "group-hover/card:-translate-y-1",
              "group-hover/card:border-amber-300/25",
              "group-hover/card:shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_32px_rgba(255,215,0,0.07),inset_0_1px_0_rgba(255,255,255,0.09)]",
            )}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(120%_80%_at_0%_-20%,rgba(251,191,36,0.12),transparent_55%),radial-gradient(100%_60%_at_100%_110%,rgba(59,130,246,0.08),transparent_50%)]"
              aria-hidden
            />
            <header className="relative flex shrink-0 items-center gap-2.5 min-w-0 p-3 pb-0 sm:gap-3 sm:p-3.5 sm:pb-0">
            <div
              className={clsx(
                "relative h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 overflow-hidden rounded-xl",
                "bg-gradient-to-br from-white/10 to-white/[0.02] shadow-[0_0_20px_rgba(255,215,0,0.12)]",
                "ring-2 ring-amber-400/20 ring-offset-2 ring-offset-zinc-950",
              )}
            >
              {symbolImageUrl && !imageError ? (
                <Image
                  src={symbolImageUrl}
                  alt=""
                  fill
                  className="object-cover object-center"
                  sizes="40px"
                  unoptimized
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/25 text-[9px]">
                  —
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={handleTitleClick}
                    className={clsx(
                      "w-full text-left",
                      "text-[13px] font-semibold leading-snug tracking-tight text-white/90 line-clamp-4 [word-break:break-word] sm:text-[14px]",
                      "cursor-pointer rounded-md px-0.5 transition-all duration-300",
                      "hover:text-transparent hover:bg-gradient-to-r hover:from-[#fde68a] hover:via-[#fbbf24] hover:to-[#fcd34d] hover:bg-clip-text hover:drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                    )}
                    title={market.title}
                    aria-label={`Open market: ${market.title}`}
                  >
                    {market.title}
                  </button>
                </h3>
                <div
                  className={sourceBadgeClass}
                  title={sourceAria}
                  aria-label={`Data source: ${sourceAria}`}
                >
                  {platformLogo}
                </div>
              </div>
            </div>
          </header>

          <div className="relative z-[1] flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-3.5 sm:pt-3">
            <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            {isBinaryCard ? (
              <ProbabilityBar
                yesPct={yesPct}
                noPct={noPct}
                yesLabel={yes != null ? `${yes.toFixed(1)}%` : "—"}
                noLabel={no != null ? `${no.toFixed(1)}%` : "—"}
              />
            ) : showMultiOutcomeRows ? (
              <div className="flex min-h-0 flex-col overflow-hidden">
                <div
                  className={clsx(
                    "max-h-[7.25rem] min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain scrollbar-none",
                    "[-ms-overflow-style:none]",
                  )}
                  style={{ scrollbarWidth: "none" }}
                >
                  {outcomeRows.map((row, rowIdx) => {
                    const split = normalizeImpliedSplit(row.yesPct, row.noPct);
                    const pctDisplay =
                      row.yesPct != null ? `${Math.round(row.yesPct)}%` : "—";
                    const hasPct = row.yesPct != null;
                    return (
                      <div
                        key={`${row.key}-${rowIdx}`}
                        className="py-2.5 transition-colors last:pb-0 hover:bg-white/[0.02]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="min-w-0 flex-1 text-[10px] font-medium leading-snug text-white/90 line-clamp-2"
                            title={row.label}
                          >
                            {row.label}
                          </span>
                          <span
                            className={clsx(
                              "w-10 shrink-0 text-right text-[11px] font-bold tabular-nums",
                              hasPct
                                ? "bg-gradient-to-br from-white to-white/70 bg-clip-text text-transparent"
                                : "text-white/35",
                            )}
                          >
                            {pctDisplay}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={handleTrade}
                              className={clsx(
                                "rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white",
                                "bg-gradient-to-b from-emerald-400 to-emerald-700",
                                "shadow-[0_2px_12px_rgba(16,185,129,0.35),inset_0_1px_0_rgba(255,255,255,0.25)]",
                                "ring-1 ring-emerald-300/40 transition-all duration-200 hover:shadow-[0_4px_18px_rgba(16,185,129,0.45)]",
                                "active:scale-[0.96]",
                              )}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={handleTrade}
                              className={clsx(
                                "rounded-lg px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white",
                                "bg-gradient-to-b from-rose-500 to-red-700",
                                "shadow-[0_2px_12px_rgba(244,63,94,0.35),inset_0_1px_0_rgba(255,255,255,0.2)]",
                                "ring-1 ring-rose-300/35 transition-all duration-200 hover:shadow-[0_4px_18px_rgba(244,63,94,0.45)]",
                                "active:scale-[0.96]",
                              )}
                            >
                              No
                            </button>
                          </div>
                        </div>
                        <OutcomeRowBar
                          yesPct={split.yesPct}
                          noPct={split.noPct}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {isBinaryCard ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleTrade}
                  className={clsx(
                    "relative overflow-hidden rounded-xl py-2.5 text-xs font-bold text-white",
                    "bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-800",
                    "shadow-[0_4px_20px_rgba(16,185,129,0.4),inset_0_1px_0_rgba(255,255,255,0.25)]",
                    "ring-1 ring-emerald-300/50 transition-all duration-200",
                    "hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(16,185,129,0.5)] active:scale-[0.98]",
                  )}
                >
                  <span className="relative z-10 drop-shadow-sm">
                    Yes {yesBtn !== "—" && yesBtn !== "Trade" ? ` ${yesBtn}` : ""}
                  </span>
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                </button>
                <button
                  type="button"
                  onClick={handleTrade}
                  className={clsx(
                    "relative overflow-hidden rounded-xl py-2.5 text-xs font-bold text-white",
                    "bg-gradient-to-br from-rose-500 via-red-600 to-red-900",
                    "shadow-[0_4px_20px_rgba(239,68,68,0.38),inset_0_1px_0_rgba(255,255,255,0.2)]",
                    "ring-1 ring-rose-300/45 transition-all duration-200",
                    "hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(239,68,68,0.48)] active:scale-[0.98]",
                  )}
                >
                  <span className="relative z-10 drop-shadow-sm">
                    No {noBtn !== "—" && noBtn !== "Trade" ? ` ${noBtn}` : ""}
                  </span>
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                </button>
              </div>
            ) : null}
            </div>

            <div className="shrink-0 border-0 border-transparent bg-transparent p-0 shadow-none ring-0 outline-none pt-2">
            {isGenerating && countdown !== null ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openCopilotForMarket();
                }}
                className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md py-0.5 text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-[#ffc000]/40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="shrink-0 text-[11px] font-semibold tracking-tight text-[#ffc000] sm:text-xs"
                  >
                    AI Report
                  </span>
                  <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium tabular-nums text-[#ffc000]">
                    <span className="truncate">{countdown}s</span>
                  </div>
                </div>
                {volSummary}
              </button>
            ) : hasGenerated ? (
              <div className="flex min-w-0 items-center justify-between gap-2 py-0.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-[11px] font-semibold tracking-tight text-[#ffc000] sm:text-xs">
                    AI Report
                  </span>
                  <button
                    type="button"
                    disabled
                    aria-label="Report generated"
                    className="m-0 shrink-0 cursor-not-allowed border-0 bg-transparent p-0 text-[11px] font-medium text-white/45 sm:text-xs"
                  >
                    Generated
                  </button>
                </div>
                {volSummary}
              </div>
            ) : (
              <div className="flex min-w-0 items-center justify-between gap-2 py-0.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-[11px] font-semibold tracking-tight text-[#ffc000] sm:text-xs">
                    AI Report
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateButtonClick}
                    disabled={isGenerating || !ready}
                    aria-label="Generate AI report"
                    className={clsx(
                      "group/gen m-0 flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none",
                      "transition-opacity duration-200 hover:opacity-85",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ffc000]/35 focus-visible:ring-offset-0",
                      "disabled:cursor-wait disabled:opacity-50",
                    )}
                  >
                    <Image
                      src="/images/generate.webp"
                      alt=""
                      width={72}
                      height={28}
                      className="h-7 w-[4.5rem] max-w-[min(100%,4.5rem)] shrink-0 object-contain object-center"
                    />
                  </button>
                </div>
                {volSummary}
              </div>
            )}
            </div>
          </div>
        </article>
        </div>
      </div>
      <PaywallModal
        open={showPaywall}
        onClose={() => setShowPaywall(false)}
        context="rexmarkets"
        paymentMetadata={currentUserId ? { userId: currentUserId } : undefined}
      />
    </>
  );
});

export type RexMarketsCardViewProps = {
  markets: MarketWithSource[];
  onMarketClick: (m: MarketWithSource) => void;
  onMarketSelected?: (
    eventTicker: string,
    marketTitle: string,
    totalVolume: number,
    eventId?: string
  ) => void;
  onReportGenerated?: (report: any) => void;
  currentUserId: string;
};

export default function RexMarketsCardView({
  markets,
  onMarketClick,
  onMarketSelected,
  onReportGenerated,
  currentUserId,
}: RexMarketsCardViewProps) {
  if (markets.length === 0) {
    return (
      <div className="rex-markets-cards flex items-center justify-center min-h-[200px] text-white/60 text-sm">
        No markets to show.
      </div>
    );
  }

  return (
    <div className="rex-markets-cards w-full max-w-none py-2 px-2 sm:px-3 md:px-4">
      <div
        className={clsx(
          "grid w-full items-stretch gap-3 sm:gap-4",
          // Wider minimum track so cards aren’t as skinny; tracks still grow to fill the row
          "[grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))]",
        )}
      >
        {markets.map((market) => (
          <MarketDenseCard
            key={`${(market as any)._source || "x"}-${market.ticker || market.id}`}
            market={market}
            onMarketNavigate={onMarketClick}
            onMarketSelected={onMarketSelected}
            onReportGenerated={onReportGenerated}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </div>
  );
}
