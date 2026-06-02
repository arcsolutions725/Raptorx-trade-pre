"use client";

import { useId, useMemo } from "react";

function syntheticNormalizedSeries(pct: number | undefined, n = 24): number[] {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.0001) {
    return Array.from({ length: n }, () => 0.5);
  }
  const up = pct > 0;
  const strength = Math.min(Math.abs(pct) / 40, 1);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const trend = up
      ? 0.72 - t * 0.44 * strength
      : 0.28 + t * 0.44 * strength;
    const wobble =
      Math.sin(t * Math.PI * 5 + (up ? 0.3 : 2.1)) * 0.07 * strength;
    out.push(Math.max(0.06, Math.min(0.94, trend + wobble)));
  }
  return out;
}

function strokeColor(changePct: number | undefined): string {
  if (changePct == null || !Number.isFinite(changePct)) return "#737373";
  if (Math.abs(changePct) < 0.005) return "#737373";
  return changePct > 0 ? "#22c55e" : "#ef4444";
}

function format24hLabel(changePct: number | undefined): {
  text: string;
  title: string;
  className: string;
} {
  if (changePct == null || !Number.isFinite(changePct)) {
    return { text: "—", title: "", className: "text-white/45" };
  }
  const rawAbs = Math.abs(changePct);
  const fullTitle = `${changePct > 0 ? "▲ " : "▼ "}${rawAbs.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })}%`;

  if (rawAbs < 0.005) {
    return { text: "0.00%", title: "0.00%", className: "text-white/45" };
  }

  const sign = changePct > 0 ? "▲ " : "▼ ";
  let display: string;
  if (rawAbs < 1000) {
    display = `${sign}${rawAbs.toFixed(2)}%`;
  } else if (rawAbs < 1_000_000) {
    const k = rawAbs / 1000;
    display = `${sign}${k >= 100 ? k.toFixed(1) : k.toFixed(2)}K%`;
  } else if (rawAbs < 1_000_000_000) {
    const m = rawAbs / 1_000_000;
    display = `${sign}${m >= 100 ? m.toFixed(1) : m.toFixed(2)}M%`;
  } else if (rawAbs < 1_000_000_000_000) {
    const b = rawAbs / 1_000_000_000;
    display = `${sign}${b >= 100 ? b.toFixed(1) : b.toFixed(2)}B%`;
  } else {
    const t = rawAbs / 1_000_000_000_000;
    display = `${sign}${t >= 100 ? t.toFixed(1) : t.toFixed(2)}T%`;
  }

  if (changePct > 0) {
    return { text: display, title: fullTitle, className: "text-green-500" };
  }
  return { text: display, title: fullTitle, className: "text-red-500" };
}

type Props = {
  changePct24h: number | undefined;
  /** Normalized 0–1 series (older → newer). Empty = use synthetic from % */
  seriesY: number[] | undefined;
  isFetching?: boolean;
};

export function Token24hSparkline({
  changePct24h,
  seriesY,
  isFetching,
}: Props) {
  const filterId = useId().replace(/:/g, "");
  const points = useMemo(() => {
    if (seriesY && seriesY.length >= 2) return seriesY;
    return syntheticNormalizedSeries(changePct24h);
  }, [seriesY, changePct24h]);

  const color = strokeColor(changePct24h);
  const label = format24hLabel(changePct24h);

  const w = 100;
  const h = 34;
  const padX = 2;
  const padY = 5;

  const pathD = useMemo(() => {
    if (points.length < 2) return "";
    return points
      .map((y, i) => {
        const x =
          padX + (i / (points.length - 1)) * (w - 2 * padX);
        const yy = padY + (1 - y) * (h - 2 * padY);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${yy.toFixed(1)}`;
      })
      .join("");
  }, [points]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col items-end justify-center gap-0.5 py-0.5 pr-0 sm:pr-1">
      <div className="relative h-7 w-full max-w-[104px] shrink-0">
        {isFetching && (!seriesY || seriesY.length < 2) ? (
          <div className="absolute inset-0 flex items-center justify-end">
            <span className="h-1 w-8 rounded-full bg-white/10 animate-pulse" />
          </div>
        ) : null}
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="h-full w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <filter
              id={`glow-${filterId}`}
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
            >
              <feGaussianBlur stdDeviation="0.9" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            filter={`url(#glow-${filterId})`}
          />
        </svg>
      </div>
      <span
        title={label.title || undefined}
        className={`block min-w-0 max-w-full text-right text-[11px] sm:text-xs font-medium tabular-nums leading-tight tracking-tight truncate ${label.className}`}
      >
        {label.text}
      </span>
    </div>
  );
}
