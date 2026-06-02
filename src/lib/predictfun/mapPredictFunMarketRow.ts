/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LimitlessMarket } from "@/hooks/useLimitlessMarkets";

export type PredictFunOutcome = {
  indexSet?: number;
  name?: string;
  onChainId?: string | number;
  on_chain_id?: string | number;
  bestBid?: { price?: number; size?: number } | null;
  bestAsk?: { price?: number; size?: number } | null;
};

export type PredictFunMarketStats = {
  volume24hUsd?: number;
  volumeTotalUsd?: number;
  totalLiquidityUsd?: number;
  liquidityValueUsd?: number;
};

/** Read volume/liquidity from either `stats` or `statistics` (API shape varies). */
export function predictFunVolumeFromRaw(raw: unknown): {
  volume24hUsd: number;
  volumeTotalUsd: number;
  liquidityUsd: number;
} {
  if (!raw || typeof raw !== "object") {
    return { volume24hUsd: 0, volumeTotalUsd: 0, liquidityUsd: 0 };
  }
  const r = raw as { stats?: PredictFunMarketStats; statistics?: PredictFunMarketStats };
  const stats = r.stats ?? r.statistics ?? {};
  const statistics = r.statistics ?? r.stats ?? {};
  return {
    volume24hUsd: Number(
      stats.volume24hUsd ?? statistics.volume24hUsd ?? 0
    ),
    volumeTotalUsd: Number(
      stats.volumeTotalUsd ?? statistics.volumeTotalUsd ?? 0
    ),
    liquidityUsd: Number(
      stats.totalLiquidityUsd ??
        statistics.totalLiquidityUsd ??
        stats.liquidityValueUsd ??
        statistics.liquidityValueUsd ??
        0
    ),
  };
}

/** Matches Rex table Vol(24h): prefer 24h, then lifetime total. */
export function predictFunDisplayVolumeUsd(raw: unknown): number {
  const { volume24hUsd, volumeTotalUsd } = predictFunVolumeFromRaw(raw);
  return volume24hUsd > 0 ? volume24hUsd : volumeTotalUsd;
}

/** Display volume for a mapped MarketOutcome row (handles explicit 0 on 24h). */
export function predictFunDisplayOutcomeVolume(outcome: {
  volume_24h?: number;
  volume?: number;
}): number {
  const vol24 = Number(outcome.volume_24h);
  const volTotal = Number(outcome.volume);
  if (Number.isFinite(vol24) && vol24 > 0) return vol24;
  if (Number.isFinite(volTotal) && volTotal > 0) return volTotal;
  return 0;
}

/** Flatten GraphQL `outcomes.edges[].node` or numeric `bestBid`/`bestAsk` fields. */
export function normalizePredictFunOutcomes(
  market: PredictFunApiMarket | Record<string, unknown> | null | undefined
): PredictFunOutcome[] {
  if (!market || typeof market !== "object") return [];

  const rawOutcomes = (market as PredictFunApiMarket).outcomes;
  if (Array.isArray(rawOutcomes)) {
    return rawOutcomes.map((o, idx) => {
      const row = o as PredictFunOutcome & {
        index?: number;
        bestBid?: number | { price?: number; size?: number };
        bestAsk?: number | { price?: number; size?: number };
      };
      const toLevel = (
        value: number | { price?: number; size?: number } | null | undefined
      ): { price?: number; size?: number } | null => {
        if (value == null) return null;
        if (typeof value === "number") {
          return Number.isFinite(value) ? { price: value } : null;
        }
        if (typeof value === "object") return value;
        return null;
      };
      return {
        indexSet:
          typeof row.indexSet === "number"
            ? row.indexSet
            : typeof row.index === "number"
              ? row.index
              : idx + 1,
        name: row.name,
        onChainId: row.onChainId ?? row.on_chain_id,
        bestBid: toLevel(row.bestBid),
        bestAsk: toLevel(row.bestAsk),
      };
    });
  }

  if (rawOutcomes == null || typeof rawOutcomes !== "object") return [];
  const edges = (rawOutcomes as { edges?: unknown }).edges;
  if (!Array.isArray(edges)) return [];

  return edges
    .map((edge: any, idx: number) => {
      const node = edge?.node;
      if (!node || typeof node !== "object") return null;
      return {
        indexSet:
          typeof node.index === "number"
            ? node.index
            : typeof node.indexSet === "number"
              ? node.indexSet
              : idx + 1,
        name: node.name,
        onChainId: node.onChainId ?? node.on_chain_id,
        bestBid:
          node.bestBid && typeof node.bestBid === "object"
            ? node.bestBid
            : typeof node.bestBid === "number"
              ? { price: node.bestBid }
              : null,
        bestAsk:
          node.bestAsk && typeof node.bestAsk === "object"
            ? node.bestAsk
            : typeof node.bestAsk === "number"
              ? { price: node.bestAsk }
              : null,
      } as PredictFunOutcome;
    })
    .filter((o): o is PredictFunOutcome => o != null);
}

export type PredictFunApiMarket = {
  id: number | string;
  title?: string;
  question?: string;
  description?: string;
  imageUrl?: string | null;
  categorySlug?: string;
  status?: string;
  tradingStatus?: string;
  /** Implied yes probability 0–100 from predict.fun listing/detail APIs. */
  chancePercentage?: number;
  outcomes?: PredictFunOutcome[];
  stats?: PredictFunMarketStats;
  /** Category/market payloads from GET /categories sometimes use `statistics` instead of `stats`. */
  statistics?: PredictFunMarketStats;
};

function centsFromPrice(price: number | null | undefined): number | string {
  if (price == null || !Number.isFinite(price)) return "—";
  return price * 100;
}

/** First outcome's bestAsk in cents (price * 100), per predict.fun listing UI. */
export function predictFunFirstOutcomeAskCents(
  market: PredictFunApiMarket | null | undefined
): number | null {
  const outcomes = normalizePredictFunOutcomes(market);
  const ask = Number(outcomes[0]?.bestAsk?.price);
  if (!Number.isFinite(ask)) return null;
  return ask * 100;
}

export function predictFunOutcomeAskCents(
  market: PredictFunApiMarket | null | undefined,
  outcomeIndex: number
): number | null {
  const outcomes = normalizePredictFunOutcomes(market);
  const ask = Number(outcomes[outcomeIndex]?.bestAsk?.price);
  if (!Number.isFinite(ask)) return null;
  return ask * 100;
}

/** Nested market shape for RexMarketsCardView (same as Polymarket outcomePrices). */
export function predictFunChildToCardSubMarket(m: PredictFunApiMarket): {
  id: string | number | undefined;
  title: string;
  groupItemTitle: string;
  outcomePrices?: string;
  volume24hr: number;
  volume: number;
} {
  const outs = Array.isArray(m?.outcomes) ? m.outcomes : [];
  const yesIdx = outs.findIndex((o) => /^yes$/i.test(String(o?.name ?? "").trim()));
  const noIdx = outs.findIndex((o) => /^no$/i.test(String(o?.name ?? "").trim()));
  const yesOut = yesIdx >= 0 ? outs[yesIdx] : outs[0];
  const noOut = noIdx >= 0 ? outs[noIdx] : outs[1];

  const to01 = (o: PredictFunOutcome | undefined): number | null => {
    const p = Number(o?.bestAsk?.price);
    return Number.isFinite(p) ? p : null;
  };

  let yes01 = to01(yesOut);
  let no01 = to01(noOut);
  if (yes01 != null && no01 == null) no01 = Math.max(0, 1 - yes01);
  if (yes01 == null && no01 != null) yes01 = Math.max(0, 1 - no01);

  const title = String(m?.title ?? m?.question ?? "").trim() || "Outcome";

  return {
    id: m?.id,
    title,
    groupItemTitle: title,
    outcomePrices:
      yes01 != null
        ? JSON.stringify([yes01, no01 ?? Math.max(0, 1 - yes01)])
        : undefined,
    volume24hr: Number(
      m?.stats?.volume24hUsd ?? m?.statistics?.volume24hUsd ?? 0
    ),
    volume: Number(
      m?.stats?.volumeTotalUsd ?? m?.statistics?.volumeTotalUsd ?? 0
    ),
  };
}

function yesPriceFromOutcomes(outcomes: PredictFunOutcome[]): number | null {
  const yes =
    outcomes.find((o) => /^yes$/i.test(String(o.name ?? "").trim())) ??
    outcomes[0];
  const bid = yes?.bestBid?.price;
  const ask = yes?.bestAsk?.price;
  if (typeof bid === "number" && typeof ask === "number") return (bid + ask) / 2;
  if (typeof ask === "number") return ask;
  if (typeof bid === "number") return bid;
  return null;
}

function noPriceFromOutcomes(outcomes: PredictFunOutcome[]): number | null {
  const no =
    outcomes.find((o) => /^no$/i.test(String(o.name ?? "").trim())) ??
    outcomes[1];
  const bid = no?.bestBid?.price;
  const ask = no?.bestAsk?.price;
  if (typeof bid === "number" && typeof ask === "number") return (bid + ask) / 2;
  if (typeof ask === "number") return ask;
  if (typeof bid === "number") return bid;
  const yes = yesPriceFromOutcomes(outcomes);
  if (yes != null) return Math.max(0, 1 - yes);
  return null;
}

/**
 * Map Predict.fun market to Limitless-shaped Rex table/card row.
 */
export function mapPredictFunApiMarketToRow(
  raw: PredictFunApiMarket
): LimitlessMarket & { _source: "predictfun"; slug: string; predictFunMarketId: number } {
  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  const isBinary = outcomes.length === 2;
  const yesP = yesPriceFromOutcomes(outcomes);
  const noP = noPriceFromOutcomes(outcomes);

  let choiceI: string | number = "—";
  let choiceII: string | number = "—";
  let yesPrice: string | number = "—";
  let noPrice: string | number = "—";

  if (isBinary) {
    yesPrice = centsFromPrice(yesP);
    noPrice = centsFromPrice(noP);
  } else if (outcomes.length >= 2) {
    const sorted = [...outcomes].sort((a, b) => {
      const pa = a.bestAsk?.price ?? a.bestBid?.price ?? 0;
      const pb = b.bestAsk?.price ?? b.bestBid?.price ?? 0;
      return pb - pa;
    });
    choiceI = centsFromPrice(
      sorted[0]?.bestAsk?.price ?? sorted[0]?.bestBid?.price ?? null
    );
    choiceII = centsFromPrice(
      sorted[1]?.bestAsk?.price ?? sorted[1]?.bestBid?.price ?? null
    );
  }

  const id = String(raw.id);
  const slug = raw.categorySlug?.trim() || id;
  const { volume24hUsd: vol24, volumeTotalUsd: volTotal, liquidityUsd } =
    predictFunVolumeFromRaw(raw);

  return {
    id,
    ticker: id,
    slug,
    title: raw.title ?? raw.question ?? id,
    description: raw.description,
    image: raw.imageUrl ?? undefined,
    icon: raw.imageUrl ?? undefined,
    active:
      raw.tradingStatus === "OPEN" ||
      raw.tradingStatus === "ACTIVE" ||
      raw.status === "REGISTERED",
    closed: false,
    archived: false,
    volume: volTotal,
    volume24hr: vol24,
    liquidity: liquidityUsd,
    markets: isBinary
      ? [
          {
            outcomePrices: JSON.stringify([yesP ?? 0, noP ?? 0]),
            title: raw.title,
            volume24hr: vol24,
          },
        ]
      : [],
    yesPrice,
    noPrice,
    choiceI,
    choiceII,
    rawEventData: raw,
    _source: "predictfun",
    predictFunMarketId: Number(raw.id),
  };
}
