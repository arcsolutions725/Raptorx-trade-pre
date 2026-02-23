"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3 } from "lucide-react";
import type { TopMarketsEmbedPayload } from "@/lib/ai/tools/market";

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

export type DeepAnalysisParams = {
  provider: "polymarket" | "kalshi";
  marketId: string;
  title: string;
};

function MarketCard({
  id,
  title,
  volume,
  volume24hr,
  provider,
  imageUrl,
  onDeepAnalysis,
  disableDeepAnalysis,
}: {
  id: string;
  title: string;
  volume: number;
  volume24hr?: number;
  provider: "polymarket" | "kalshi";
  imageUrl?: string;
  onDeepAnalysis?: (params: DeepAnalysisParams) => void;
  disableDeepAnalysis?: boolean;
}) {
  const href =
    provider === "polymarket"
      ? `/rexmarkets/polymarket/${encodeURIComponent(id)}`
      : `/rexmarkets/kalshi/${encodeURIComponent(id)}`;
  const vol = volume24hr ?? volume;

  return (
    <div className="group relative flex flex-col rounded-xl border border-white/10 bg-[#141414] hover:border-[#FFC000]/50 transition-all p-4 min-h-25">
      <Link href={href} className="flex flex-col flex-1 min-w-0">
        {/* Market symbol with provider badge at bottom-right (badge outside clip so it stays fully visible) */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="relative w-10 h-10 shrink-0">
            <div className="absolute inset-0 rounded-lg overflow-hidden bg-white/5">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="w-10 h-10 object-cover"
                />
              ) : (
                <span className="flex w-full h-full items-center justify-center text-white/40 text-lg font-medium">
                  {title.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span
              className={`absolute -bottom-2 -right-2 flex items-center justify-center w-5 h-5 rounded-lg shadow-md ${
                provider === "kalshi" ? "bg-[#17cb91]" : "bg-[#2C59F7]"
              }`}
            >
              {provider === "polymarket" ? (
                <Image
                  src="/images/polymarket.png"
                  alt="Polymarket"
                  width={12}
                  height={12}
                  className="w-3 h-3"
                />
              ) : (
                <span className="text-white text-[14px] font-medium! leading-none">K</span>
              )}
            </span>
          </div>
          {vol > 0 && (
            <span className="text-white/60 text-xs font-mono shrink-0">
              Vol {formatVolume(vol)}
            </span>
          )}
        </div>
        <div
          className="text-white/95 font-medium text-sm leading-snug flex-1 line-clamp-2"
          title={title}
        >
          {title}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[#FFC000] text-xs font-semibold group-hover:gap-2 transition-all">
          <Image src="/images/banner.png" alt="RaptorX" width={14} height={14} />
          <span>Trade on Rex Markets</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </Link>
      {onDeepAnalysis && (
        <button
          type="button"
          disabled={disableDeepAnalysis}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disableDeepAnalysis) return;
            onDeepAnalysis({ provider, marketId: id, title });
          }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Deep Analysis
        </button>
      )}
    </div>
  );
}

export function TopMarketsCards({
  payload,
  onDeepAnalysis,
  disableDeepAnalysis,
}: {
  payload: TopMarketsEmbedPayload;
  onDeepAnalysis?: (params: DeepAnalysisParams) => void;
  disableDeepAnalysis?: boolean;
}) {
  const polymarket = (payload?.polymarket ?? []).filter((m) => m?.id);
  const kalshi = (payload?.kalshi ?? []).filter((m) => m?.id);
  const hasAny = polymarket.length > 0 || kalshi.length > 0;
  const message = payload?.message;
  const categoryList = payload?.categoryList;
  if (!hasAny && !message) return null;

  return (
    <div className="my-4 w-full min-w-0 max-w-full space-y-4">
      {message && (
        <div className="text-white/90 text-sm leading-relaxed mb-2">
          {message}
          {categoryList && categoryList.length > 0 && (
            <p className="mt-2 text-white/70 text-xs">
              Available categories: {categoryList.join(", ")}.
            </p>
          )}
        </div>
      )}
      {polymarket.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {polymarket.map((m) => (
            <MarketCard
              key={`poly-${m.id}`}
              id={m.id}
              title={m.title}
              volume={m.volume}
              volume24hr={m.volume24hr}
              provider="polymarket"
              imageUrl={m.imageUrl}
              onDeepAnalysis={onDeepAnalysis}
              disableDeepAnalysis={disableDeepAnalysis}
            />
          ))}
        </div>
      )}
      {kalshi.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {kalshi.map((m) => (
            <MarketCard
              key={`kalshi-${m.id}`}
              id={m.id}
              title={m.title}
              volume={m.volume}
              volume24hr={m.volume24hr}
              provider="kalshi"
              imageUrl={m.imageUrl}
              onDeepAnalysis={onDeepAnalysis}
              disableDeepAnalysis={disableDeepAnalysis}
            />
          ))}
        </div>
      )}
    </div>
  );
}
