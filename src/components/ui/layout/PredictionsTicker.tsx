"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRexmarketsDetailHref } from "@/lib/rexmarkets/marketRoutes";

/**
 * Live prediction-odds ticker (RaptorX design: `.ticker` with a "Predictions" group).
 * Data: the open Kalshi markets list Rex Predictions already uses (/api/kalshi/markets).
 * Each item links to its Rex Predictions market page.
 */

type KalshiTickerMarket = {
  ticker?: string;
  event_ticker?: string;
  title?: string;
  yes_price?: number;
  no_price?: number;
};

type TickerItem = {
  key: string;
  href: string;
  question: string;
  yes: number;
  no: number;
};

const TICKER_LIMIT = 15;

function toPct(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  // Kalshi prices arrive as 0–1 dollars; tolerate 0–100 as well.
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export default function PredictionsTicker({
  className = "",
}: {
  className?: string;
}) {
  const { data, isPending } = useQuery({
    queryKey: ["predictions-ticker", "kalshi", TICKER_LIMIT],
    queryFn: async () => {
      const res = await fetch(
        `/api/kalshi/markets?limit=${TICKER_LIMIT}&status=open`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`Prediction ticker failed: ${res.status}`);
      return (await res.json()) as { markets?: KalshiTickerMarket[] };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const items = useMemo<TickerItem[]>(() => {
    const markets = Array.isArray(data?.markets) ? data.markets : [];
    const out: TickerItem[] = [];
    for (const m of markets) {
      const question = (m?.title ?? "").trim();
      const href = getRexmarketsDetailHref(m, "kalshi");
      const yes = toPct(m?.yes_price);
      if (!question || !href || yes == null) continue;
      const no = toPct(m?.no_price) ?? 100 - yes;
      out.push({
        key: m.ticker || m.event_ticker || question,
        href,
        question,
        yes,
        no,
      });
    }
    return out;
  }, [data]);

  // Nothing to show once loaded (error / empty list): take no space at all.
  if (!isPending && items.length === 0) return null;

  // ~5s of travel per item keeps the pace close to the design's 80s loop.
  const trackStyle = {
    "--rx-ticker-dur": `${Math.max(40, items.length * 5)}s`,
  } as CSSProperties;

  return (
    <div
      className={`rx-ticker h-8 flex-none gap-3 border-b border-[rgba(255,236,205,0.08)] bg-[rgba(7,7,7,0.9)] px-5 ${className}`}
      aria-label="Live prediction odds"
      role="region"
    >
      <span className="rx-badge rx-badge--live shrink-0">Live</span>
      <div className="shrink-0 rounded-md border border-rx-gold-line px-[7px] py-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.14em] text-rx-gold-hi">
        Predictions
      </div>
      <div className="rx-ticker__viewport group/ticker">
        {items.length > 0 ? (
          <div
            className="flex w-max items-center gap-[26px] animate-[scrollInfinite_var(--rx-ticker-dur)_linear_infinite] group-hover/ticker:[animation-play-state:paused] group-focus-within/ticker:[animation-play-state:paused] motion-reduce:animate-none"
            style={trackStyle}
          >
            {[0, 1].map((copy) =>
              items.map((item) => (
                <Link
                  key={`${copy}-${item.key}`}
                  href={item.href}
                  prefetch={false}
                  className="rx-ticker__item shrink-0 rounded transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rx-gold-hi"
                  aria-hidden={copy === 1 || undefined}
                  tabIndex={copy === 1 ? -1 : undefined}
                  title={item.question}
                >
                  <div className="rx-ticker__q">{item.question}</div>
                  <div className="text-rx-up">Yes {item.yes}%</div>
                  <div className="text-rx-down">No {item.no}%</div>
                </Link>
              )),
            )}
          </div>
        ) : (
          <div className="flex items-center gap-6" aria-hidden="true">
            {[180, 150, 200, 160].map((w, i) => (
              <span key={i} className="rx-skel h-2.5" style={{ width: w }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
