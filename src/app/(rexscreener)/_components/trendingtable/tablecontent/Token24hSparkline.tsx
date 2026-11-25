"use client";

import { useMemo } from "react";
import clsx from "clsx";

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

type Tone = "up" | "down" | "flat" | "none";

function toneOf(changePct: number | undefined): Tone {
  if (changePct == null || !Number.isFinite(changePct)) return "none";
  if (Math.abs(changePct) < 0.005) return "flat";
  return changePct > 0 ? "up" : "down";
}

/** RaptorX signal colours (--rx-up / --rx-down), neutral for flat or missing. */
function strokeColor(changePct: number | undefined): string {
  const tone = toneOf(changePct);
  if (tone === "up") return "#45E3A3";
  if (tone === "down") return "#FF7A7A";
  return "#8A8988";
}

function format24hLabel(changePct: number | undefined): {
  text: string;
  title: string;
  tone: Tone;
} {
  const tone = toneOf(changePct);
  if (changePct == null || tone === "none") {
    return { text: "—", title: "", tone };
  }
  const rawAbs = Math.abs(changePct);
  const fullTitle = `${changePct > 0 ? "▲ " : "▼ "}${rawAbs.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  })}%`;

  if (tone === "flat") {
    return { text: "0.00%", title: "0.00%", tone };
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

  return { text: display, title: fullTitle, tone };
}

/** 24h price change as an up / down badge (RexScreener "24h" column). */
export function Token24hChangeBadge({
  changePct24h,
}: {
  changePct24h: number | undefined;
}) {
  const label = format24hLabel(changePct24h);
  if (label.tone === "none") {
    return <span className="text-rx-text-3">—</span>;
  }
  return (
    <span
      title={label.title || undefined}
      className={clsx(
        "rx-badge max-w-full overflow-hidden text-ellipsis tabular-nums",
        label.tone === "up"
          ? "rx-badge--up"
          : label.tone === "down"
            ? "rx-badge--down"
            : "rx-badge--neutral",
      )}
    >
      {label.text}
    </span>
  );
}

type Props = {
  changePct24h: number | undefined;
  /** Normalized 0–1 series (older → newer). Empty = use synthetic from % */
  seriesY: number[] | undefined;
  isFetching?: boolean;
};

/** 24h trend line (hourly from Birdeye; falls back to a shape drawn from the 24h %). */
export function Token24hSparkline({
  changePct24h,
  seriesY,
  isFetching,
}: Props) {
  const points = useMemo(() => {
    if (seriesY && seriesY.length >= 2) return seriesY;
    return syntheticNormalizedSeries(changePct24h);
  }, [seriesY, changePct24h]);

  const color = strokeColor(changePct24h);
  const waiting = Boolean(isFetching && (!seriesY || seriesY.length < 2));

  const w = 80;
  const h = 28;
  const padX = 1;
  const padY = 3;

  const pathD = useMemo(() => {
    if (points.length < 2) return "";
    return points
      .map((y, i) => {
        const x = padX + (i / (points.length - 1)) * (w - 2 * padX);
        const yy = padY + (1 - y) * (h - 2 * padY);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${yy.toFixed(1)}`;
      })
      .join("");
  }, [points]);

  return (
    <div className="relative h-7 w-20 shrink-0">
      {waiting ? (
        <span
          className="rx-skel absolute inset-x-2 top-1/2 h-1 -translate-y-1/2"
          aria-hidden="true"
        />
      ) : null}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        className={clsx("block h-full w-full", waiting && "opacity-30")}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
