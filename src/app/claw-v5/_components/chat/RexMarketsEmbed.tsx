"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import ProbabilityChart from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/shared/ProbabilityChart";
import { useMarketInsights, useMarketSummary } from "@/hooks/useMarketDetails";

// RexMarkets embed rendering (used by ```rexmarkets blocks)
function formatPrice(price?: number | string): string {
  const numPrice = typeof price === "string" ? Number(price) : price;
  if (typeof numPrice !== "number" || Number.isNaN(numPrice)) return "—";
  return `$${(numPrice * 100).toFixed(2)}¢`;
}

function formatProbability(probability?: number | string): string {
  const numProb =
    typeof probability === "string" ? Number(probability) : probability;
  if (typeof numProb !== "number" || Number.isNaN(numProb)) return "—";
  return `${(numProb * 100).toFixed(1)}%`;
}

function formatBidAsk(value?: number | string): string {
  const numValue = typeof value === "string" ? Number(value) : value;
  if (typeof numValue !== "number" || Number.isNaN(numValue)) return "—";
  if (numValue === 0) return "0";
  if (numValue < 1 && numValue > 0) return numValue.toFixed(2);
  if (numValue >= 100) return numValue.toFixed(0);
  return numValue.toFixed(1);
}

/** Effective liquidity: use API liquidity when > 0, else bid+ask depth as proxy. */
function getEffectiveLiquidity(o: {
  liquidity?: number;
  yes_bid?: number;
  yes_ask?: number;
}): number {
  const liq = Number(o.liquidity) || 0;
  if (liq > 0) return liq;
  const bid = Number(o.yes_bid) || 0;
  const ask = Number(o.yes_ask) || 0;
  return bid + ask;
}

/** Completed/closed markets have no liquidity and should be hidden. */
function isCompletedMarket(o: { status?: string }): boolean {
  const s = (o.status || "").toLowerCase();
  return ["closed", "resolved", "archived", "finalized"].includes(s);
}

/** Filter out completed markets and sort by liquidity descending. */
function filterAndSortByLiquidity(markets: any[]): any[] {
  const filtered = markets.filter(
    (o) => !isCompletedMarket(o) && getEffectiveLiquidity(o) > 0
  );
  filtered.sort((a, b) => getEffectiveLiquidity(b) - getEffectiveLiquidity(a));
  return filtered;
}

function getExternalLinkUrl(
  provider: "polymarket" | "kalshi",
  marketDetails: any,
): string | null {
  if (!marketDetails) return null;
  if (provider === "polymarket") {
    const ticker = marketDetails.ticker || marketDetails.series_ticker || null;
    if (!ticker) return null;
    return `https://polymarket.com/event/${ticker}`;
  }

  const seriesTicker =
    marketDetails.series_ticker || marketDetails.seriesTicker || null;
  const eventTicker =
    marketDetails.event_ticker || marketDetails.eventTicker || null;
  const rangedGroupName =
    marketDetails.ranged_group_name || marketDetails.rangedGroupName || "";
  if (!seriesTicker || !eventTicker || !rangedGroupName) return null;
  const kebab = String(rangedGroupName)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `https://kalshi.com/markets/${seriesTicker}/${kebab}/${eventTicker}`;
}

function getRaptorxTradeUrl(
  provider: "polymarket" | "kalshi",
  marketDetails: any,
  raptorxUrl?: string,
): string | null {
  if (typeof raptorxUrl === "string" && raptorxUrl.trim())
    return raptorxUrl.trim();
  if (!marketDetails) return null;

  // For Polymarket, prefer slug (RexMarkets routes support slug nicely).
  if (provider === "polymarket") {
    const slug = marketDetails.slug || null;
    const ticker = marketDetails.ticker || marketDetails.series_ticker || null;
    const eventId = marketDetails.event_id || marketDetails.eventId || null;
    const id = slug || ticker || eventId;
    if (!id) return null;
    return `/rexmarkets/polymarket/${encodeURIComponent(String(id))}`;
  }

  // For Kalshi, we can use event_ticker.
  const eventTicker =
    marketDetails.event_ticker || marketDetails.eventTicker || null;
  if (!eventTicker) return null;
  return `/rexmarkets/kalshi/${encodeURIComponent(String(eventTicker))}`;
}

export function RexMarketsEmbed({ payload }: { payload: any }) {
  const [stable] = useState(() => ({
    provider: (payload?.provider || "polymarket") as "polymarket" | "kalshi",
    marketDetails: payload?.marketDetails ?? null,
    raptorxUrl: payload?.raptorxUrl as string | undefined,
  }));

  const provider = stable.provider;
  const md = stable.marketDetails;
  const raptorxUrl = stable.raptorxUrl;

  const title = md?.title || "Market";
  const symbol = md?.symbol_image_url || md?.symbolImageUrl || "";
  const rawMarkets: any[] = Array.isArray(md?.markets) ? md.markets : [];
  const markets = filterAndSortByLiquidity(rawMarkets);
  // For insights, use all non-completed outcomes (don't require liquidity) so insights generate when volume is $0
  const marketsForInsights =
    rawMarkets.length > 0
      ? rawMarkets.filter((o) => !isCompletedMarket(o))
      : rawMarkets;
  const tradeUrl = getRaptorxTradeUrl(provider, md, raptorxUrl);

  const {
    summary,
    isGenerating: isGeneratingSummary,
    error: summaryError,
  } = useMarketSummary(title, md);
  const {
    insights,
    isGenerating: isGeneratingInsights,
    error: insightsError,
  } = useMarketInsights(title, marketsForInsights.length > 0 ? marketsForInsights : markets, md);

  return (
    <div className="my-3 w-full min-w-0 max-w-full rounded-xl border border-white/10 overflow-hidden">
      <div className="p-3 sm:p-4 bg-transparent">
        <div className="flex items-center gap-3">
          {symbol ? (
            <Image
              src={symbol}
              alt={title}
              width={44}
              height={44}
              className="rounded-lg"
              unoptimized
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[#ffc000] font-bold text-lg break-words">
                {title}
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold text-xs border shadow-sm ${
                  provider === "kalshi"
                    ? "bg-gradient-to-r from-[#09C285] to-[#07A875] text-white border-[#0AE09A]/20"
                    : "bg-gradient-to-r from-[#265CFF] to-[#1E4DD9] text-white border-[#4A7AFF]/20"
                }`}
              >
                {provider === "kalshi" ? (
                  <>
                    <span className="text-white font-bold">K</span>
                    <span className="hidden sm:inline">Kalshi</span>
                  </>
                ) : (
                  <>
                    <Image
                      src="/images/polymarket.png"
                      alt="Polymarket"
                      width={14}
                      height={14}
                      className="w-[14px] h-[14px]"
                    />
                    <span className="hidden sm:inline">Polymarket</span>
                  </>
                )}
              </span>
              {tradeUrl && (
                <a
                  href={tradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ffc000] hover:bg-[#ffc000]/90 border border-white/10 transition-colors text-xs text-black max-w-full"
                  aria-label="Trade on RaptorX"
                  title="Trade on RaptorX"
                >
                  <Image
                    src={"/images/banner.png"}
                    alt="banner image"
                    width={20}
                    height={20}
                  />
                  <span className="font-semibold">Trade on RaptorX</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Situation Brief */}
        <div className="mt-4">
          <div className="text-white/90 text-sm font-semibold mb-2">
            Situation <span className="text-[#ffc000]">Brief:</span>
          </div>
          {isGeneratingSummary ? (
            <div className="text-white/60 italic text-sm">
              Generating summary...
            </div>
          ) : summary ? (
            <div className="text-white/85 text-sm leading-relaxed">
              {summary}
            </div>
          ) : summaryError ? (
            <div className="text-white/60 italic text-sm">
              Summary unavailable
            </div>
          ) : (
            <div className="text-white/60 italic text-sm">
              No summary available
            </div>
          )}
        </div>

        {/* Table */}
        {/* Mobile: stacked cards (no horizontal scrolling) */}
        <div className="mt-4 sm:hidden space-y-3">
          {markets.length > 0 ? (
            markets.slice(0, 25).map((outcome, idx) => (
              <div
                key={outcome.ticker || `${idx}`}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="text-white font-medium break-words">
                  {outcome.subtitle || outcome.title || "—"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="text-white/60">Probability</div>
                  <div className="text-[#ffc000] font-medium">
                    {formatProbability(outcome.probability)}
                  </div>

                  <div className="text-white/60">
                    <span className="text-[#00b050]">Yes</span> Price
                  </div>
                  <div className="text-[#00b050] font-medium">
                    {formatPrice(outcome.yes_price)}
                  </div>

                  <div className="text-white/60">
                    <span className="text-red-400">No</span> Price
                  </div>
                  <div className="text-red-400 font-medium">
                    {formatPrice(outcome.no_price)}
                  </div>

                  <div className="text-white/60">Volume</div>
                  <div className="text-white font-mono">
                    {(
                      (outcome.volume_24h ?? outcome.volume) ||
                      0
                    ).toLocaleString()}
                  </div>

                  <div className="text-white/60">
                    <span className="text-[#00b050]">Bid</span> Depth
                  </div>
                  <div className="text-white font-mono">
                    {formatBidAsk(outcome.yes_bid)}
                  </div>

                  <div className="text-white/60">
                    <span className="text-red-400">Ask</span> Depth
                  </div>
                  <div className="text-white font-mono">
                    {formatBidAsk(outcome.yes_ask)}
                  </div>

                  <div className="text-white/60">Liquidity</div>
                  <div className="text-white font-mono">
                    {(outcome.liquidity || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-white/60 text-sm">
              No market data available
            </div>
          )}
        </div>

        {/* Desktop/tablet: full table */}
        <div className="mt-4 hidden sm:block">
          <table className="w-full text-sm table-fixed">
            <thead className="border-b border-[#ffc000]">
              <tr>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Outcome
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Probability
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-[#00b050]">Yes</span> Price
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-red-400">No</span> Price
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Volume
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-[#00b050]">Bid</span> Depth
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  <span className="text-red-400">Ask</span> Depth
                </th>
                <th className="px-3 py-3 text-left text-[#ffc000] font-semibold whitespace-nowrap">
                  Liquidity
                </th>
              </tr>
            </thead>
            <tbody>
              {markets.length > 0 ? (
                markets.slice(0, 25).map((outcome, idx) => (
                  <tr
                    key={outcome.ticker || `${idx}`}
                    className={`border-b border-white/10 ${
                      idx % 2 === 0 ? "bg-white/5" : "bg-transparent"
                    }`}
                  >
                    <td className="px-3 py-3 text-white font-medium break-words">
                      {outcome.subtitle || outcome.title || "—"}
                    </td>
                    <td className="px-3 py-3 text-[#ffc000] whitespace-nowrap">
                      {formatProbability(outcome.probability)}
                    </td>
                    <td className="px-3 py-3 text-[#00b050] whitespace-nowrap">
                      {formatPrice(outcome.yes_price)}
                    </td>
                    <td className="px-3 py-3 text-red-400 whitespace-nowrap">
                      {formatPrice(outcome.no_price)}
                    </td>
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {(
                        (outcome.volume_24h ?? outcome.volume) ||
                        0
                      ).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {formatBidAsk(outcome.yes_bid)}
                    </td>
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {formatBidAsk(outcome.yes_ask)}
                    </td>
                    <td className="px-3 py-3 text-white whitespace-nowrap">
                      {(outcome.liquidity || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-white/60"
                  >
                    No market data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Polymarket chart (matches RexMarkets behavior) */}
        {provider === "polymarket" && markets.length > 0 && (
          <div className="mt-4">
            <ProbabilityChart
              markets={markets as any}
              totalVolume={md?.total_volume}
            />
          </div>
        )}

        {/* AI Insights */}
        <div className="mt-4">
          {isGeneratingInsights ? (
            <div className="text-white/60 italic text-sm">
              Generating insights...
            </div>
          ) : insights && insights.length > 0 ? (
            <ul className="space-y-3">
              {insights.map((insight: string, idx: number) => (
                <li key={idx} className="flex items-start gap-3">
                  <span className="text-[#ffc000] font-bold flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <span className="text-white/90 leading-relaxed text-sm">
                    {insight}
                  </span>
                </li>
              ))}
            </ul>
          ) : insightsError ? (
            <div className="text-white/60 italic text-sm">
              Insights unavailable
            </div>
          ) : (
            <div className="text-white/60 italic text-sm">
              No insights available
            </div>
          )}
        </div>

        {/* Stats */}
        {(md?.total_volume || md?.total_series_volume) && (
          <div className="mt-4">
            <div className="text-white/90 text-sm font-semibold mb-2">
              Market <span className="text-[#ffc000]">Statistics</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-white/60 text-xs mb-1">Total Volume</div>
                  <div className="text-white text-base font-semibold">
                    ${Number(md.total_volume || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-white/60 text-xs mb-1">
                    Series Volume
                  </div>
                  <div className="text-white text-base font-semibold">
                    ${Number(md.total_series_volume || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trade on RaptorX CTA (Polymarket & Kalshi) */}
        {tradeUrl && (
          <div className="mt-4 flex justify-center">
            <a
              href={tradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-md font-semibold text-xs transition-all duration-200 hover:scale-105 shadow-md bg-[#ffc000] hover:bg-[#ffc000]/90 text-black border border-white/10"
            >
              <Image
                src={"/images/banner.png"}
                alt="RaptorX"
                width={16}
                height={16}
              />
              <span className="font-semibold">Trade on RaptorX</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
