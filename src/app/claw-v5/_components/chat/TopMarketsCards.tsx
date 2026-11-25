"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import type { TopMarketsEmbedPayload } from "@/lib/ai/tools/market";
import SourceLogo from "./SourceLogo";

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
    <div className="ps-group__head">
      <SourceLogo kind={provider} />
      {capitalizeFirst(label)}
    </div>
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
    <article className="rx-raised ps-card touch-manipulation">
      <div className="ps-card__top">
        <span className="ps-card__icon">
          {imageUrl ? (
            <Image src={imageUrl} alt="" width={32} height={32} />
          ) : (
            title.charAt(0).toUpperCase()
          )}
        </span>

        {vol > 0 && (
          <span className="rx-badge rx-badge--neutral rx-num">
            Vol {formatVolume(vol)}
          </span>
        )}
      </div>

      {/* Fixed two-line height so the actions line up across cards in a row */}
      <div className="ps-card__q" title={title}>
        {title}
      </div>

      <div className="ps-card__actions">
        <Link
          href={href}
          target="_blank"
          className="rx-btn rx-btn--secondary rx-btn--s rex-markets-embed-link"
        >
          Trade on Rex Markets
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>

        {/* Deep analysis (onTouchEnd keeps it reliable on iOS) */}
        {onDeepAnalysis && (
          <button
            type="button"
            onClick={() =>
              onDeepAnalysis({ provider, marketId: id, title })
            }
            onTouchEnd={(e) => {
              e.preventDefault();
              onDeepAnalysis({ provider, marketId: id, title });
            }}
            className="rx-btn rx-btn--report rx-btn--s"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <FileText
              className="size-3 pointer-events-none text-rx-gold"
              aria-hidden="true"
            />
            <span className="pointer-events-none">Deep analysis</span>
          </button>
        )}
      </div>
    </article>
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
    <div className="ps-wrap">
      {payload?.message && (
        <div className="text-[15px] leading-relaxed text-rx-text">
          {payload.message}
        </div>
      )}

      {sections.map(([provider, list]) =>
        list.length > 0 && (
          <section key={provider} className="ps-group" aria-label={PROVIDER_LABEL[provider]}>
            <CardGroupTitle provider={provider} label={PROVIDER_LABEL[provider]} />

            <div className="ps-grid">
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
          </section>
        )
      )}
    </div>
  );
}
