"use client";

import { useState } from "react";
import Image from "next/image";
import copy from "copy-to-clipboard";
import { useParams, usePathname } from "next/navigation";
import { formatPrice } from "@/utils/polymarketTrading";
import {
  MarketThumb,
  VenueBadge,
} from "@/app/rexmarkets/_components/RexMarketsTable/MarketDataTable/listUi";
import {
  IconCheck,
  IconDoc,
  IconShare,
  MarketCrumbs,
  StatStrip,
  type StatItem,
} from "../../../shared/marketUi";

/**
 * Market head shared by every venue's detail page (prototype design/market.html: .crumbs + .mk-head):
 * breadcrumbs, icon, title + venue badge, stat strip, and the tools (news intelligence report,
 * share, Claw AI 5.0 toggle for the Rex Pilot sidebar). Styles: styles/pages/market.css (.rx-mk-top).
 */
type TradingHeaderProps = {
  marketTitle?: string | null;
  symbolImageUrl?: string;
  currentYesPrice: number;
  totalVolume?: number;
  /** Optional label after volume (e.g. "USDC") */
  volumeLabel?: string;
  /** Optional symbol before volume (e.g. "$") */
  volumePrefix?: string;
  /** Optional "Series volume" stat (Kalshi) */
  seriesVolume?: number;
  /** Category shown in the breadcrumbs (Rex Predictions › category › market) */
  category?: string | null;
  /** Venue badge next to the title; derived from the URL when omitted */
  venue?: string;
  onBack?: () => void;
  onGenerateClick?: () => void;
  isGenerating?: boolean;
  countdown?: number | null;
  hasGenerated?: boolean;
  ready?: boolean;
  canGenerate?: boolean;
  /** Claw AI 5.0 button: opens / closes the Rex Pilot sidebar (shown when given) */
  onPilotToggle?: () => void;
  /** Whether the Rex Pilot sidebar is open (aria-expanded on the Claw AI 5.0 button) */
  pilotOpen?: boolean;
  /** id of the sidebar element the Claw AI 5.0 button controls */
  pilotControlsId?: string;
};

const VENUE_FROM_PATH: Record<string, string> = {
  kalshi: "kalshi",
  polymarket: "polymarket",
  limitless: "limitless",
  myriad: "myriad",
  "predict-fun": "predictfun",
};

export default function TradingHeader({
  marketTitle,
  symbolImageUrl,
  currentYesPrice,
  totalVolume,
  volumeLabel,
  volumePrefix,
  seriesVolume,
  category,
  venue,
  onBack,
  onGenerateClick,
  isGenerating,
  countdown,
  hasGenerated,
  ready,
  canGenerate,
  onPilotToggle,
  pilotOpen,
  pilotControlsId,
}: TradingHeaderProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const params = useParams();
  const pathname = usePathname();

  const handleShareClick = () => {
    const baseUrl = window.location.origin;
    const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
    if (path.startsWith("/rexmarkets/polymarket/") || path.startsWith("/rexmarkets/kalshi/") || path.startsWith("/rexmarkets/limitless/") || path.startsWith("/rexmarkets/myriad/") || path.startsWith("/rexmarkets/predict-fun/")) {
      const eventDetailUrl = `${baseUrl}${path}`;
      const copied = copy(eventDetailUrl);
      if (copied) {
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 2000);
      }
      return;
    }

    const eventSlug = params?.event as string | undefined;
    if (!eventSlug) {
      const currentUrl = window.location.href;
      const copied = copy(currentUrl);
      if (copied) {
        setShowTooltip(true);
        setTimeout(() => setShowTooltip(false), 2000);
      }
      return;
    }

    const eventDetailUrl = `${baseUrl}/rexmarkets/polymarket/${encodeURIComponent(eventSlug)}`;

    const copied = copy(eventDetailUrl);
    if (copied) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
    }
  };

  const venueKey =
    venue ?? VENUE_FROM_PATH[(pathname || "").split("/").filter(Boolean)[1] ?? ""];

  // Same numbers as before; "Change" keeps the existing calculation, shown as a down move.
  const changePct =
    Number.isFinite(currentYesPrice) && currentYesPrice > 0
      ? (currentYesPrice - 0.75) * 100
      : null;
  const formatVolume = (v: number | undefined) =>
    `${volumePrefix ?? ""}${
      typeof v === "number" && Number.isFinite(v) ? v.toLocaleString() : "0"
    }${volumeLabel ? ` ${volumeLabel}` : ""}`;

  const stats: StatItem[] = [
    {
      label: "Yes price",
      value: Number.isFinite(currentYesPrice) ? `${formatPrice(currentYesPrice)}` : "—",
    },
    {
      label: "Change",
      value: changePct !== null ? `▼ ${Math.abs(changePct).toFixed(2)}%` : "—",
      tone: changePct !== null ? "down" : undefined,
    },
    { label: "Volume", value: formatVolume(totalVolume) },
  ];
  if (typeof seriesVolume === "number" && Number.isFinite(seriesVolume)) {
    stats.push({ label: "Series volume", value: formatVolume(seriesVolume) });
  }

  const generateDisabled = isGenerating || !ready || !canGenerate;

  return (
    <div className="rx-mk-top">
      <MarketCrumbs title={marketTitle} category={category} onBack={onBack} />

      <div className="mk-head">
        <span className="mk-head__icon">
          <MarketThumb src={symbolImageUrl} title={marketTitle || "Market"} size={42} />
        </span>

        <div className="mk-head__main">
          <h1 className="mk-head__title">
            <span className="t">{marketTitle}</span>
            {venueKey ? <VenueBadge venue={venueKey} /> : null}
          </h1>
          <StatStrip items={stats} />
        </div>

        <div className="mk-head__tools">
          {onGenerateClick ? (
            isGenerating && countdown !== null ? (
              <span className="rx-btn rx-btn--report rx-btn--s mk-gen mk-gen--busy">
                <span className="rx-spin" aria-hidden="true" />
                Generating report
                <span className="rx-num">{countdown}s</span>
              </span>
            ) : hasGenerated ? (
              <span className="rx-btn rx-btn--report rx-btn--s mk-gen mk-gen--done" role="status">
                <IconCheck size={12} />
                Generated!
              </span>
            ) : (
              <button
                type="button"
                className="rx-btn rx-btn--report rx-btn--s mk-gen"
                onClick={onGenerateClick}
                disabled={generateDisabled}
              >
                <IconDoc size={12} />
                Generate news intelligence report
              </button>
            )
          ) : null}

          <span className="mk-share-wrap">
            <button
              type="button"
              onClick={handleShareClick}
              className="rx-icon-btn mk-share"
              aria-label="Share market link"
              title="Copy market link"
            >
              <IconShare size={14} />
            </button>
            {showTooltip && (
              <span className="mk-copied" role="status">
                <IconCheck size={12} />
                Link copied
              </span>
            )}
          </span>

          {onPilotToggle ? (
            <button
              type="button"
              className="rx-btn rx-btn--claw rx-btn--s"
              onClick={onPilotToggle}
              aria-expanded={!!pilotOpen}
              aria-controls={pilotControlsId}
              title={pilotOpen ? "Close Rex Pilot" : "Open Rex Pilot"}
            >
              <Image
                src="/images/claw-logo-96.webp"
                alt=""
                width={20}
                height={20}
                className="claw-ico"
              />
              Claw AI 5.0
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
