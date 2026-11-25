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
import {
  CheckIcon,
  MarketThumb,
  ReportIcon,
  VenueBadge,
  formatCents,
  formatPct,
} from "./listUi";

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

type DenseCardProps = {
  market: MarketWithSource;
  onMarketNavigate: (m: MarketWithSource) => void;
  onMarketSelected?: (
    eventTicker: string,
    marketTitle: string,
    totalVolume: number,
    eventId?: string,
    marketSource?: string
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
  const [showPaywall, setShowPaywall] = useState(false);
  const category = (market as KalashiMarket).category;

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
    onMarketSelected(key, market.title ?? "", vol, eid, (market as any)._source);
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

  /** Outcome rows visible before the list scrolls; the rest stay reachable by scrolling or on the market page. */
  const VISIBLE_OUTCOMES = 2;
  const hiddenOutcomes = Math.max(0, outcomeRows.length - VISIBLE_OUTCOMES);

  return (
    <>
      <article
        className={clsx(
          "rx-raised group/card flex h-full min-h-[270px] min-w-0 flex-col gap-3.5 p-[18px]",
          "transition-[transform,border-color] duration-150 ease-[cubic-bezier(.2,.7,.2,1)]",
          "hover:-translate-y-0.5 hover:border-rx-gold-line motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        )}
      >
        <header className="flex min-w-0 items-start gap-3">
          <MarketThumb src={symbolImageUrl} title={market.title} size={42} />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 min-w-0">
              <button
                type="button"
                onClick={handleTitleClick}
                className={clsx(
                  "line-clamp-2 min-h-[2.7em] w-full text-left text-[15px] font-semibold leading-[1.35] text-rx-text [word-break:break-word]",
                  "cursor-pointer transition-colors hover:text-rx-gold-hi",
                  "focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi",
                )}
                title={market.title}
                aria-label={`Open market: ${market.title}`}
              >
                {market.title}
              </button>
            </h3>
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-rx-text-2">
              <VenueBadge venue={source} />
              {category && <span className="truncate">{category}</span>}
            </div>
          </div>
        </header>

        {isBinaryCard ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              {/* div/b/small: the global `span, button { font-family: inherit }` rule would drop the display/mono faces */}
              <div className="font-display text-[30px] font-[750] leading-none tracking-[-.01em] text-rx-text [font-stretch:112%]">
                {yes != null ? formatPct(yes) : "—"}
                <small className="ml-1 font-sans text-[13px] font-medium tracking-normal text-rx-text-2 [font-stretch:100%]">
                  chance Yes
                </small>
              </div>
              <span className="rx-small whitespace-nowrap">Implied odds</span>
            </div>
            <div
              className="rx-split"
              role="img"
              aria-label={`Implied probability ${yes != null ? formatPct(yes) : "—"} yes versus ${no != null ? formatPct(no) : "—"} no`}
            >
              <span
                className="transition-[width] duration-300 ease-out"
                style={{ width: `${yesPct}%`, background: "var(--rx-up)" }}
              />
              <span
                className="transition-[width] duration-300 ease-out"
                style={{ width: `${noPct}%`, background: "var(--rx-down)" }}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleTrade} className="rx-yes rx-yes--l">
                Yes
                {yes != null && <b className="rx-num font-bold">{formatCents(yes)}</b>}
              </button>
              <button type="button" onClick={handleTrade} className="rx-no rx-no--l">
                No
                {no != null && <b className="rx-num font-bold">{formatCents(no)}</b>}
              </button>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-col gap-1.5">
            <div
              className="flex max-h-[82px] min-h-0 touch-pan-y flex-col gap-1.5 overflow-y-auto overscroll-y-contain scrollbar-none"
              style={{ scrollbarWidth: "none" }}
            >
              {outcomeRows.map((row, rowIdx) => {
                const hasPct = row.yesPct != null;
                return (
                  <div key={`${row.key}-${rowIdx}`} className="flex shrink-0 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-[13px] text-rx-text"
                        title={row.label}
                      >
                        {row.label}
                      </span>
                      <b
                        className={clsx(
                          "w-12 shrink-0 text-right font-mono text-[15px] font-bold tabular-nums",
                          hasPct ? "text-rx-text" : "text-rx-text-3",
                        )}
                      >
                        {hasPct ? `${Math.round(row.yesPct as number)}%` : "—"}
                      </b>
                      <button
                        type="button"
                        onClick={handleTrade}
                        className="rx-yes shrink-0"
                        aria-label={`Buy Yes on ${row.label}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={handleTrade}
                        className="rx-no shrink-0"
                        aria-label={`Buy No on ${row.label}`}
                      >
                        No
                      </button>
                    </div>
                    <div className="rx-bar h-1" aria-hidden>
                      <span style={{ width: `${hasPct ? row.yesPct : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {hiddenOutcomes > 0 && (
              <button
                type="button"
                onClick={handleTrade}
                className="self-start text-[13px] text-rx-text-2 transition-colors hover:text-rx-text"
              >
                + {hiddenOutcomes} more outcome{hiddenOutcomes === 1 ? "" : "s"}
              </button>
            )}
          </div>
        )}

        <footer className="mt-auto flex min-w-0 items-center justify-between gap-2 border-t border-rx-line pt-3">
          <div className="rx-small rx-num min-w-0 truncate">
            Vol <b className="font-semibold text-rx-text">{volLabel}</b>
          </div>
          {isGenerating && countdown !== null ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCopilotForMarket();
              }}
              className="rx-btn rx-btn--report rx-btn--s tabular-nums"
              aria-label={`Report generating, ${countdown} seconds left. Open Rex Pilot`}
            >
              <span className="rx-spin size-3 border-[1.5px] text-rx-gold" aria-hidden />
              Generating {countdown}s
            </button>
          ) : hasGenerated ? (
            <span className="rx-badge rx-badge--up h-8 shrink-0 gap-1.5 px-2.5 text-[12px]">
              <CheckIcon />
              Report generated
            </span>
          ) : (
            <button
              type="button"
              onClick={handleGenerateButtonClick}
              disabled={isGenerating || !ready}
              aria-label="Generate AI report"
              className="rx-btn rx-btn--report rx-btn--s shrink-0"
            >
              <ReportIcon />
              Generate report
            </button>
          )}
        </footer>
      </article>
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
    eventId?: string,
    marketSource?: string
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
      <p className="rx-small flex min-h-[200px] items-center justify-center text-center">
        No markets to show.
      </p>
    );
  }

  return (
    <ul className="m-0 grid w-full list-none items-stretch gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
      {markets.map((market) => (
        <li
          key={`${(market as any)._source || "x"}-${market.ticker || market.id}`}
          className="min-w-0"
        >
          <MarketDenseCard
            market={market}
            onMarketNavigate={onMarketClick}
            onMarketSelected={onMarketSelected}
            onReportGenerated={onReportGenerated}
            currentUserId={currentUserId}
          />
        </li>
      ))}
    </ul>
  );
}
