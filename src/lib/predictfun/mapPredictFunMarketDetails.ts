/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MarketDetails, MarketOutcome } from "@/hooks/useMarketDetails";
import { extractPredictFunCategoryChildMarkets } from "@/lib/predictfun/extractCategoryChildMarkets";
import {
  resolvePredictFunNumericMarketId,
} from "@/lib/predictfun/predictFunCryptoMarket";
import {
  normalizePredictFunOutcomes,
  predictFunDisplayVolumeUsd,
  predictFunVolumeFromRaw,
  type PredictFunApiMarket,
} from "@/lib/predictfun/mapPredictFunMarketRow";

function outcomeToMarketOutcome(
  o: any,
  marketId: string,
  marketRaw?: PredictFunApiMarket | Record<string, unknown>
): MarketOutcome {
  const name = String(o?.name ?? "Outcome").trim();
  const bid = Number(o?.bestBid?.price);
  const ask = Number(o?.bestAsk?.price);
  const mid =
    Number.isFinite(bid) && Number.isFinite(ask)
      ? (bid + ask) / 2
      : Number.isFinite(ask)
        ? ask
        : Number.isFinite(bid)
          ? bid
          : 0;
  const vol = predictFunVolumeFromRaw(marketRaw);

  return {
    ticker: `${marketId}-${o?.indexSet ?? name}`,
    subtitle: name,
    probability: mid,
    yes_price: mid,
    no_price: Math.max(0, 1 - mid),
    volume: vol.volumeTotalUsd,
    volume_24h: vol.volume24hUsd,
    yes_bid: Number.isFinite(bid) ? bid * 100 : 0,
    yes_ask: Number.isFinite(ask) ? ask * 100 : 0,
    liquidity:
      vol.liquidityUsd > 0
        ? vol.liquidityUsd
        : Number(o?.bestBid?.size ?? 0) + Number(o?.bestAsk?.size ?? 0),
    open_interest: 0,
    status: "open",
  };
}

export function mapPredictFunMarketDetailToMarketDetails(
  apiBody: { data?: any; success?: boolean } | any
): MarketDetails {
  const raw = (apiBody as { data?: any })?.data ?? apiBody;
  const childMarketsPreview = extractPredictFunCategoryChildMarkets(
    raw && typeof raw === "object" ? raw : null
  );
  const asCategory =
    childMarketsPreview.length > 0 &&
    !(Array.isArray(raw?.outcomes) && raw.outcomes.length > 0);

  if (asCategory) {
    const categoryId = String(raw?.slug ?? raw?.id ?? "");
    const childMarkets = childMarketsPreview;
    const selectedChild = childMarkets[0] ?? null;
    const resolvedMarketId = resolvePredictFunNumericMarketId(
      selectedChild as Record<string, unknown> | null | undefined,
      raw as Record<string, unknown>
    );
    const childOutcomes = childMarkets.map((m: any, idx: number): MarketOutcome => {
      const chance = Number(m?.chancePercentage ?? 0) / 100;
      const title = String(m?.title ?? `Outcome ${idx + 1}`).trim();
      const childVol = predictFunVolumeFromRaw(m);
      const outs = normalizePredictFunOutcomes(m);
      const yesIdx = outs.findIndex((o) => /^yes$/i.test(String(o?.name ?? "").trim()));
      const yesOut = outs[yesIdx >= 0 ? yesIdx : 0];
      const bid = Number(yesOut?.bestBid?.price);
      const ask = Number(yesOut?.bestAsk?.price);
      const bidDepth = Number(yesOut?.bestBid?.size ?? 0);
      const askDepth = Number(yesOut?.bestAsk?.size ?? 0);
      return {
        ticker: String(m?.id ?? `${categoryId}-${idx}`),
        subtitle: title,
        probability: Number.isFinite(chance) ? chance : 0,
        yes_price: Number.isFinite(chance) ? chance : 0,
        no_price: Number.isFinite(chance) ? Math.max(0, 1 - chance) : 1,
        volume: childVol.volumeTotalUsd,
        volume_24h: childVol.volume24hUsd,
        yes_bid:
          bidDepth > 0
            ? bidDepth
            : Number.isFinite(bid)
              ? bid * 100
              : 0,
        yes_ask:
          askDepth > 0
            ? askDepth
            : Number.isFinite(ask)
              ? ask * 100
              : 0,
        liquidity: childVol.liquidityUsd,
        open_interest: 0,
        status: String(m?.status ?? "open").toLowerCase(),
      };
    });

    const categoryVol = predictFunVolumeFromRaw(raw);
    const childrenVol24 = childMarkets.reduce(
      (sum: number, m: unknown) =>
        sum + predictFunVolumeFromRaw(m).volume24hUsd,
      0
    );
    const displayVol =
      categoryVol.volume24hUsd > 0
        ? categoryVol.volume24hUsd
        : childrenVol24 > 0
          ? childrenVol24
          : categoryVol.volumeTotalUsd;

    return {
      series_ticker: categoryId,
      ticker: resolvedMarketId || String(selectedChild?.id ?? categoryId),
      slug: String(raw?.slug ?? categoryId),
      title: raw?.title ?? categoryId,
      subtitle: raw?.title,
      category: String(raw?.marketVariant ?? "predictfun"),
      markets: childOutcomes,
      total_volume: displayVol,
      total_series_volume:
        categoryVol.volumeTotalUsd > 0
          ? categoryVol.volumeTotalUsd
          : displayVol,
      symbol_image_url: raw?.imageUrl ?? "",
      description: raw?.description,
      liquidity: categoryVol.liquidityUsd,
      id: categoryId,
      rawEventData: {
        ...(selectedChild ?? {}),
        parentCategory: raw,
        childMarkets,
        categorySlug: categoryId,
      },
    };
  }

  const id = String(raw?.id ?? "");
  const outcomes = normalizePredictFunOutcomes(raw);
  const vol = predictFunVolumeFromRaw(raw);
  const displayVol = predictFunDisplayVolumeUsd(raw);

  return {
    series_ticker: id,
    ticker: id,
    slug: raw?.categorySlug ?? id,
    title: raw?.title ?? raw?.question ?? id,
    subtitle: raw?.question,
    category: raw?.categorySlug ?? "predictfun",
    markets: outcomes.map((o: any) => outcomeToMarketOutcome(o, id, raw)),
    total_volume: displayVol,
    total_series_volume:
      vol.volumeTotalUsd > 0 ? vol.volumeTotalUsd : displayVol,
    symbol_image_url: raw?.imageUrl ?? "",
    description: raw?.description,
    liquidity: vol.liquidityUsd,
    id,
    rawEventData: raw,
  };
}
