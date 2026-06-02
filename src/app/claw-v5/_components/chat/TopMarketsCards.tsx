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

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type DeepAnalysisParams = {
  provider: "polymarket" | "kalshi" | "limitless" | "myriad" | "predictfun";
  marketId: string;
  title: string;
};

export type DeepAnalysisHandler = (
  params: DeepAnalysisParams,
) => void | Promise<void>;

type Provider = "polymarket" | "kalshi" | "limitless" | "myriad" | "predictfun";

const PROVIDER_LABEL: Record<Provider, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  limitless: "Limitless",
  myriad: "Myriad",
  predictfun: "Predict.fun",
};

type MarketItem = NonNullable<
  TopMarketsEmbedPayload["polymarket"]
>[number];

function CardGroupTitle({
  provider,
  label,
}: {
  provider: Provider;
  label: string;
}) {
  return (
    <h4 className="flex items-center gap-2.5 font-sans text-base font-semibold text-[#FFC000]">
      {provider === "polymarket" ? (
        <Image src="/images/polymarket.png" alt="" width={22} height={22} />
      ) : provider === "limitless" ? (
        <span
          className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-[#c3ff01]"
          aria-hidden
        >
          <Image
            src="/images/limitless-logo-new.webp"
            alt=""
            width={18}
            height={18}
            className="object-contain"
          />
        </span>
      ) : provider === "myriad" ? (
        <Image src="/images/myriad.webp" alt="" width={22} height={22} />
      ) : provider === "predictfun" ? (
        <Image src="/images/predict-fun.webp" alt="" width={22} height={22} />
      ) : (
        <span className="flex size-[22px] items-center justify-center rounded-md bg-[#17cb91] text-white text-sm font-bold">
          K
        </span>
      )}
      {capitalizeFirst(label)}
    </h4>
  );
}

function MarketCard({
  id,
  title,
  volume,
  volume24hr,
  provider,
  imageUrl,
  onDeepAnalysis,
}: {
  id: string;
  title: string;
  volume: number;
  volume24hr?: number;
  provider: Provider;
  imageUrl?: string;
  onDeepAnalysis?: DeepAnalysisHandler;
}) {
  const href =
    provider === "polymarket"
      ? `/rexmarkets/polymarket/${encodeURIComponent(id)}`
      : provider === "kalshi"
      ? `/rexmarkets/kalshi/${encodeURIComponent(id)}`
      : provider === "limitless"
      ? `/rexmarkets/limitless/${encodeURIComponent(id)}`
      : provider === "predictfun"
      ? `/rexmarkets/predict-fun/${encodeURIComponent(id)}`
      : `/rexmarkets/myriad/${encodeURIComponent(id)}`;

  const vol = volume24hr ?? volume;

  return (
    <div className="group relative flex min-w-0 flex-col rounded-xl border border-white/10 bg-[#141414] hover:border-[#FFC000]/50 transition-all p-4 min-h-25 touch-manipulation">
      
      {/* CONTENT */}
      <div className="flex flex-1 flex-col min-w-0">
        
        {/* HEADER */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="h-10 w-10 overflow-hidden rounded-lg bg-white/5">
            {imageUrl ? (
              <Image src={imageUrl} alt="" width={40} height={40} />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-white/40">
                {title.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {vol > 0 && (
            <span className="text-xs text-white/60 font-mono">
              Vol {formatVolume(vol)}
            </span>
          )}
        </div>

        {/* TITLE — fixed two-line height so “Trade on Rex Markets” lines up across cards in a row */}
        <div className="text-white/95 text-sm font-medium leading-5 line-clamp-2 min-h-10">
          {title}
        </div>

        {/* LINK: full-width flex row so alignment isn’t affected by parent text-align on inline-flex */}
        <div className="mt-3 flex w-full min-w-0 justify-start text-start">
          <Link
            href={href}
            target="_blank"
            className="relative z-10 flex min-w-0 max-w-full items-center justify-start gap-1.5 text-[#FFC000] text-xs font-semibold"
          >
            <Image
              src="/images/banner.png"
              alt=""
              width={14}
              height={14}
              className="size-3.5 shrink-0"
            />
            <span className="min-w-0">Trade on Rex Markets</span>
            <ArrowRight className="size-3.5 shrink-0" />
          </Link>
        </div>
      </div>

      {/* BUTTON (iOS SAFE) */}
      {onDeepAnalysis && (
        <div className="mt-3 w-full">
          <button
            type="button"
            onClick={() =>
              onDeepAnalysis({ provider, marketId: id, title })
            }
            onTouchEnd={(e) => {
              e.preventDefault();
              onDeepAnalysis({ provider, marketId: id, title });
            }}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2.5 text-white/90 text-xs font-medium cursor-pointer touch-manipulation active:bg-white/15"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <BarChart3 className="w-3.5 h-3.5 pointer-events-none" />
            <span className="pointer-events-none">Deep Analysis</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function TopMarketsCards({
  payload,
  onDeepAnalysis,
}: {
  payload: TopMarketsEmbedPayload;
  onDeepAnalysis?: DeepAnalysisHandler;
}) {
  const polymarket = (payload?.polymarket ?? []).filter((m) => m?.id);
  const limitless = (payload?.limitless ?? []).filter((m) => m?.id);
  const kalshi = (payload?.kalshi ?? []).filter((m) => m?.id);
  const myriad = (payload?.myriad ?? []).filter((m) => m?.id);
  const predictfun = (payload?.predictfun ?? []).filter((m) => m?.id);

  const hasAny =
    polymarket.length ||
    limitless.length ||
    kalshi.length ||
    myriad.length ||
    predictfun.length;

  if (!hasAny && !payload?.message) return null;

  const sections: [Provider, MarketItem[]][] = [
    ["polymarket", polymarket],
    ["limitless", limitless],
    ["predictfun", predictfun],
    ["kalshi", kalshi],
    ["myriad", myriad],
  ];

  return (
    <div className="my-4 space-y-4">
      {payload?.message && (
        <div className="text-white/90 text-sm">{payload.message}</div>
      )}

      {sections.map(([provider, list]) =>
        list.length > 0 && (
          <div key={provider} className="space-y-2">
            <CardGroupTitle provider={provider} label={PROVIDER_LABEL[provider]} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => (
                <MarketCard
                  key={`${provider}-${m.id}`}
                  id={m.id}
                  title={m.title}
                  volume={m.volume}
                  volume24hr={m.volume24hr}
                  provider={provider}
                  imageUrl={m.imageUrl}
                  onDeepAnalysis={onDeepAnalysis}
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}