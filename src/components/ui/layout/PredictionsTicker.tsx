"use client";

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRexmarketsDetailHref } from "@/lib/rexmarkets/marketRoutes";

/**
 * Live prediction markets bar above the header (RaptorX design: `.pm-bar`).
 * The split-ticker layout: prediction odds run across the top of the product, live crypto
 * prices across the bottom (Footer). Both move left to right and pause on hover / focus.
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

  // ~6s of travel per item keeps the pace close to the design's 90s loop.
  const trackStyle = {
    "--rx-ticker-dur": `${Math.max(45, items.length * 6)}s`,
  } as CSSProperties;

  return (
    <div
      className={`rx-pm-bar ${className}`}
      role="region"
      aria-label="Live prediction markets"
    >
      <span className="rx-pm-bar__tag">
        <i aria-hidden="true" />
        Predictions
      </span>
      <div className="rx-ticker__viewport">
        {items.length > 0 ? (
          <div className="rx-ticker__track" style={trackStyle}>
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
                  <span className="rx-ticker__q">{item.question}</span>
                  <span className="rx-up">Yes {item.yes}%</span>
                  <span className="rx-down">No {item.no}%</span>
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
