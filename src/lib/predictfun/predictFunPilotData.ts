/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MarketDetails, MarketOutcome } from "@/hooks/useMarketDetails";
import { extractPredictFunCategoryChildMarkets } from "@/lib/predictfun/extractCategoryChildMarkets";
import {
  normalizePredictFunOutcomes,
  predictFunDisplayOutcomeVolume,
  predictFunOutcomeAskCents,
  predictFunVolumeFromRaw,
  type PredictFunApiMarket,
  type PredictFunOutcome,
} from "@/lib/predictfun/mapPredictFunMarketRow";
import { selectPredictFunTopChartMarkets } from "@/lib/predictfun/parsePriceChart";

function normalizedOutcomes(market: PredictFunApiMarket): PredictFunOutcome[] {
  return normalizePredictFunOutcomes(market);
}

function outcomeAsk01(
  market: PredictFunApiMarket,
  kind: "yes" | "no"
): number | null {
  const outs = normalizedOutcomes(market);
  const idx = outs.findIndex((o) =>
    new RegExp(kind === "yes" ? "^yes$" : "^no$", "i").test(String(o?.name ?? "").trim())
  );
  const i = idx >= 0 ? idx : kind === "yes" ? 0 : 1;
  const target = outs[i];
  const bid = Number(target?.bestBid?.price);
  const ask = Number(target?.bestAsk?.price);
  if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
    return (bid + ask) / 2;
  }
  if (Number.isFinite(ask) && ask > 0) return ask;
  if (Number.isFinite(bid) && bid > 0) return bid;
  const cents = predictFunOutcomeAskCents({ ...market, outcomes: outs }, i);
  return cents == null ? null : cents / 100;
}

function chanceToProbability(market: PredictFunApiMarket): number {
  const chancePct = Number(market.chancePercentage ?? 0);
  if (Number.isFinite(chancePct) && chancePct > 0) return chancePct / 100;
  const yes = outcomeAsk01(market, "yes");
  if (yes != null) return yes;
  return 0;
}

function topOfBookDepthUsd(
  level: { price?: number; size?: number } | null | undefined
): number {
  const price = Number(level?.price);
  const size = Number(level?.size);
  if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) {
    return 0;
  }
  return price * size;
}

function mergeMappedOutcome(
  mapped: MarketOutcome | undefined,
  built: MarketOutcome
): MarketOutcome {
  if (!mapped) return built;
  const vol = predictFunDisplayOutcomeVolume(built);
  const mappedVol = predictFunDisplayOutcomeVolume(mapped);
  return {
    ...built,
    volume: built.volume > 0 ? built.volume : mapped.volume,
    volume_24h:
      (built.volume_24h ?? 0) > 0 ? built.volume_24h : mapped.volume_24h,
    liquidity: built.liquidity > 0 ? built.liquidity : mapped.liquidity,
    yes_bid: built.yes_bid > 0 ? built.yes_bid : mapped.yes_bid,
    yes_ask: built.yes_ask > 0 ? built.yes_ask : mapped.yes_ask,
    probability: built.probability > 0 ? built.probability : mapped.probability,
    yes_price: built.yes_price > 0 ? built.yes_price : mapped.yes_price,
    no_price: built.no_price > 0 ? built.no_price : mapped.no_price,
    ...(vol <= 0 && mappedVol > 0
      ? { volume: mapped.volume, volume_24h: mapped.volume_24h }
      : null),
  };
}

function childToMarketOutcome(
  market: PredictFunApiMarket,
  categoryId: string,
  index: number,
  mapped?: MarketOutcome
): MarketOutcome {
  const prob = chanceToProbability(market);
  const yes01 = outcomeAsk01(market, "yes") ?? prob;
  const no01 = outcomeAsk01(market, "no") ?? Math.max(0, 1 - yes01);
  const vol = predictFunVolumeFromRaw(market);
  const outs = normalizedOutcomes(market);
  const yesIdx = outs.findIndex((o) => /^yes$/i.test(String(o?.name ?? "").trim()));
  const bidIdx = yesIdx >= 0 ? yesIdx : 0;
  const yesOut = outs[bidIdx];
  const bid = Number(yesOut?.bestBid?.price);
  const ask = Number(yesOut?.bestAsk?.price);
  const bidDepthUsd = topOfBookDepthUsd(yesOut?.bestBid);
  const askDepthUsd = topOfBookDepthUsd(yesOut?.bestAsk);
  const bidSizeDepth = Number(yesOut?.bestBid?.size ?? 0);
  const askSizeDepth = Number(yesOut?.bestAsk?.size ?? 0);
  const outcomeSizeLiquidity =
    (Number.isFinite(bidSizeDepth) ? bidSizeDepth : 0) +
    (Number.isFinite(askSizeDepth) ? askSizeDepth : 0);
  const liquidity =
    vol.liquidityUsd > 0
      ? vol.liquidityUsd
      : outcomeSizeLiquidity > 0
        ? outcomeSizeLiquidity
        : 0;

  const built: MarketOutcome = {
    ticker: String(market.id ?? `${categoryId}-${index}`),
    subtitle: String(market.title ?? market.question ?? `Outcome ${index + 1}`).trim(),
    probability: prob,
    yes_price: yes01,
    no_price: no01,
    volume: vol.volumeTotalUsd,
    volume_24h: vol.volume24hUsd,
    yes_bid:
      bidDepthUsd > 0
        ? bidDepthUsd
        : Number.isFinite(bid) && bid > 0
          ? bid * 100
          : predictFunOutcomeAskCents({ ...market, outcomes: outs }, bidIdx) ?? 0,
    yes_ask:
      askDepthUsd > 0
        ? askDepthUsd
        : Number.isFinite(ask) && ask > 0
          ? ask * 100
          : predictFunOutcomeAskCents({ ...market, outcomes: outs }, bidIdx) ?? 0,
    liquidity,
    open_interest: 0,
    status: String(market.status ?? "open").toLowerCase(),
  };

  return mergeMappedOutcome(mapped, built);
}

/** Child / sub-markets from predict.fun market details payload. */
export function getPredictFunChildMarketsFromDetails(
  marketDetails: MarketDetails | null | undefined
): PredictFunApiMarket[] {
  if (!marketDetails) return [];
  const raw = marketDetails.rawEventData;
  if (!raw || typeof raw !== "object") return [];

  const rawAny = raw as PredictFunApiMarket & {
    childMarkets?: PredictFunApiMarket[];
    parentCategory?: Record<string, unknown>;
  };

  if (Array.isArray(rawAny.childMarkets) && rawAny.childMarkets.length > 0) {
    return rawAny.childMarkets;
  }
  if (rawAny.parentCategory && typeof rawAny.parentCategory === "object") {
    const fromParent = extractPredictFunCategoryChildMarkets(rawAny.parentCategory);
    if (fromParent.length > 0) return fromParent;
  }
  const fromRaw = extractPredictFunCategoryChildMarkets(
    raw as Record<string, unknown>
  );
  if (fromRaw.length > 0) return fromRaw;

  const normalized = normalizePredictFunOutcomes(rawAny);
  if (normalized.length > 0 && rawAny.id != null) {
    return [{ ...rawAny, outcomes: normalized }];
  }

  return [];
}

/** Rex Pilot table rows — all open sub-markets, sorted like predict.fun (chance desc, list order). */
export function buildPredictFunPilotTableOutcomes(
  marketDetails: MarketDetails | null | undefined,
  enrichedChildren?: PredictFunApiMarket[] | null
): MarketOutcome[] {
  const children =
    enrichedChildren && enrichedChildren.length > 0
      ? enrichedChildren
      : getPredictFunChildMarketsFromDetails(marketDetails);

  if (children.length === 0) {
    const fromMapped = marketDetails?.markets ?? [];
    return fromMapped.filter((o) => o.subtitle?.trim() || o.ticker?.trim());
  }

  const categoryId = String(
    marketDetails?.slug ?? marketDetails?.id ?? marketDetails?.ticker ?? "predictfun"
  );

  const mappedByTicker = new Map(
    (marketDetails?.markets ?? []).map((o) => [String(o.ticker), o])
  );

  return children
    .map((m, index) => ({ m, index }))
    .sort((a, b) => {
      const ca = Number(a.m.chancePercentage ?? 0);
      const cb = Number(b.m.chancePercentage ?? 0);
      if (cb !== ca) return cb - ca;
      return a.index - b.index;
    })
    .map(({ m, index }) =>
      childToMarketOutcome(
        m,
        categoryId,
        index,
        mappedByTicker.get(String(m.id ?? `${categoryId}-${index}`))
      )
    )
    .filter((o) => {
      const s = (o.status || "").toLowerCase();
      return !["closed", "resolved", "removed", "archived", "finalized"].includes(s);
    });
}

export { selectPredictFunTopChartMarkets };
