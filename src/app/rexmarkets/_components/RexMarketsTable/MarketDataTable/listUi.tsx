"use client";

/**
 * Shared presentation bits for the Rex Predictions list (table + card views):
 * venue badges, market thumbnails, price formatting, icons and loading skeletons.
 * Styling follows the RaptorX design system (rx-* classes + Tailwind rx colours).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { PREDICT_FUN_LOGO_SRC } from "@/lib/predictfun/assets";
import { REX_TABLE_GRID, REX_TABLE_MIN_W } from "./TableHeader";

export type MarketVenue =
  | "kalshi"
  | "polymarket"
  | "limitless"
  | "myriad"
  | "predictfun";

const VENUES: Record<
  MarketVenue,
  { label: string; className: string; logo?: string }
> = {
  kalshi: { label: "Kalshi", className: "rx-badge--kalshi" },
  polymarket: {
    label: "Polymarket",
    className: "rx-badge--polymarket",
    logo: "/images/polymarket.png",
  },
  limitless: {
    label: "Limitless",
    className: "bg-[rgba(195,255,1,.1)] text-[#D9FF66]",
    logo: "/images/limitless-logo-new-white.webp",
  },
  myriad: {
    label: "Myriad",
    className: "bg-[rgba(124,58,237,.18)] text-[#C2ABFF]",
    logo: "/images/myriad.webp",
  },
  predictfun: {
    label: "Predict.fun",
    className: "bg-[rgba(168,85,247,.16)] text-[#D6B6FF]",
    logo: PREDICT_FUN_LOGO_SRC,
  },
};

export function venueLabel(venue: string): string {
  return VENUES[venue as MarketVenue]?.label ?? venue;
}

/** Small venue pill (rx-badge) with the platform mark. */
export function VenueBadge({ venue }: { venue: string }) {
  const v = VENUES[venue as MarketVenue];
  if (!v) return null;
  return (
    <span
      className={clsx("rx-badge h-5 shrink-0 gap-1 px-1.5 text-[10.5px]", v.className)}
      title={`Data source: ${v.label}`}
    >
      {v.logo ? (
        <Image
          src={v.logo}
          alt=""
          width={12}
          height={12}
          className="size-3 shrink-0 object-contain"
        />
      ) : (
        <span className="text-[11px] font-bold leading-none" aria-hidden>
          K
        </span>
      )}
      {v.label}
    </span>
  );
}

/** Market image tile; falls back to the title's initial when there is no image or it fails. */
export function MarketThumb({
  src,
  title,
  size,
}: {
  src: string | null | undefined;
  title?: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = (title || "").trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-rx-surface-3 ring-1 ring-inset ring-white/[0.06]",
        size >= 40 ? "rounded-xl" : "rounded-lg",
      )}
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover object-center"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <b
          className="font-display text-[13px] font-bold text-rx-text-3"
          aria-hidden
        >
          {initial}
        </b>
      )}
    </span>
  );
}

const trimNum = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1);
};

/** Price in cents: 61 → "61¢", 52.5 → "52.5¢". */
export function formatCents(cents: number): string {
  return `${trimNum(cents)}¢`;
}

/** Probability in percent: 61 → "61%", 52.46 → "52.5%". */
export function formatPct(pct: number): string {
  return `${trimNum(pct)}%`;
}

/** Report icon (prototype i-doc). */
export function ReportIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      aria-hidden
      className={clsx("shrink-0 text-rx-gold", className)}
    >
      <path
        d="M6 3h9l4 4v14H6zM9 12h7M9 16h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden className={className}>
      <path
        d="M5 12l5 5 9-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </g>
    </svg>
  );
}

export function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronIcon({
  direction,
  size = 14,
}: {
  direction: "left" | "right" | "down";
  size?: number;
}) {
  const d =
    direction === "left"
      ? "M15 6l-6 6 6 6"
      : direction === "right"
        ? "M9 6l6 6-6 6"
        : "M6 9l6 6 6-6";
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
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
}

/** Table view loading rows (same grid as the real rows). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className={REX_TABLE_MIN_W} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            "grid items-center border-b border-[rgba(36,36,36,.7)]",
            REX_TABLE_GRID,
          )}
        >
          <div className="flex items-center gap-3 py-3 pl-3 pr-2.5 sm:pl-1">
            <span className="rx-skel size-8 shrink-0 rounded-lg" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="rx-skel block h-3.5 w-3/4" />
              <span className="rx-skel block h-2.5 w-1/4" />
            </span>
          </div>
          {[44, 44, 120, 40, 40, 64].map((w, k) => (
            <div key={k} className="flex justify-end px-2.5 py-3">
              <span
                className={clsx("rx-skel block", k === 2 ? "h-8" : "h-3.5")}
                style={{ width: w }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card view loading cards. */
export function CardSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div
      className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]"
      aria-hidden
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rx-raised flex min-h-[270px] flex-col gap-3.5 p-[18px]">
          <div className="flex items-start gap-3">
            <span className="rx-skel size-[42px] shrink-0 rounded-xl" />
            <span className="flex flex-1 flex-col gap-2 pt-0.5">
              <span className="rx-skel block h-3.5 w-11/12" />
              <span className="rx-skel block h-3.5 w-2/3" />
              <span className="rx-skel block h-2.5 w-1/4" />
            </span>
          </div>
          <span className="rx-skel block h-7 w-1/3" />
          <span className="rx-skel block h-2 w-full" />
          <span className="flex gap-2">
            <span className="rx-skel block h-[46px] flex-1 rounded-xl" />
            <span className="rx-skel block h-[46px] flex-1 rounded-xl" />
          </span>
          <span className="mt-auto flex items-center justify-between border-t border-rx-line pt-3">
            <span className="rx-skel block h-3 w-20" />
            <span className="rx-skel block h-8 w-32" />
          </span>
        </div>
      ))}
    </div>
  );
}
