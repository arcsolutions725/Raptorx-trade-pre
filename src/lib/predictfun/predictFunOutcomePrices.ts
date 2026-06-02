import type { PredictFunApiMarket, PredictFunOutcome } from "@/lib/predictfun/mapPredictFunMarketRow";

function outcomeMidPrice(o: PredictFunOutcome | undefined): number | null {
  if (!o) return null;
  const bid = o.bestBid?.price;
  const ask = o.bestAsk?.price;
  if (typeof bid === "number" && typeof ask === "number" && bid > 0 && ask > 0) {
    return (bid + ask) / 2;
  }
  if (typeof ask === "number" && ask > 0) return ask;
  if (typeof bid === "number" && bid > 0) return bid;
  return null;
}

function isYesLike(name: string): boolean {
  return /^(yes|up)$/i.test(name.trim());
}

function isNoLike(name: string): boolean {
  return /^(no|down)$/i.test(name.trim());
}

/** Implied 0–1 price for one outcome (bid/ask mid, then complement from paired outcome / chance %). */
export function predictFunOutcomePrice01(
  outcomes: PredictFunOutcome[],
  outcomeIndex: number,
  chancePercent?: number
): number {
  const outs = Array.isArray(outcomes) ? outcomes : [];
  const target =
    outs.find((o) => Number(o?.indexSet) === Number(outcomeIndex)) ?? outs[0];
  const direct = outcomeMidPrice(target);
  if (direct != null && direct > 0) return direct;

  const yesOut =
    outs.find((o) => isYesLike(String(o?.name ?? ""))) ?? outs[0];
  const noOut =
    outs.find((o) => isNoLike(String(o?.name ?? ""))) ?? outs[1];

  const yesP = outcomeMidPrice(yesOut);
  const noP = outcomeMidPrice(noOut);

  const name = String(target?.name ?? "");
  if (isYesLike(name) && typeof chancePercent === "number" && chancePercent > 0) {
    return chancePercent / 100;
  }
  if (isNoLike(name) && typeof chancePercent === "number" && chancePercent >= 0) {
    return Math.max(0, 1 - chancePercent / 100);
  }

  if (isYesLike(name) && yesP != null && yesP > 0) return yesP;
  if (isNoLike(name) && noP != null && noP > 0) return noP;
  if (isYesLike(name) && noP != null && noP > 0) return Math.max(0, 1 - noP);
  if (isNoLike(name) && yesP != null && yesP > 0) return Math.max(0, 1 - yesP);

  return 0;
}

export type PredictFunOrderbookLevels = {
  bids: [number, number][];
  asks: [number, number][];
};

/** Best bid for sells, best ask for buys (0–1 price). */
export function predictFunOrderbookTradePrice01(
  book: PredictFunOrderbookLevels | null | undefined,
  side: "buy" | "sell"
): number {
  if (!book) return 0;
  if (side === "sell") {
    const bids = book.bids ?? [];
    let best = 0;
    for (const [price] of bids) {
      if (typeof price === "number" && price > best) best = price;
    }
    return best;
  }
  const asks = book.asks ?? [];
  let best = 0;
  for (const [price] of asks) {
    if (typeof price === "number" && (best === 0 || price < best)) best = price;
  }
  return best;
}

export function resolvePredictFunTradePrice01(args: {
  marketRaw?: PredictFunApiMarket | null;
  outcomeIndex: number;
  side: "buy" | "sell";
  orderbook?: PredictFunOrderbookLevels | null;
}): number {
  const chancePct = Number((args.marketRaw as { chancePercentage?: number })?.chancePercentage);
  const fromOutcome = predictFunOutcomePrice01(
    args.marketRaw?.outcomes ?? [],
    args.outcomeIndex,
    Number.isFinite(chancePct) ? chancePct : undefined
  );
  const fromBook = predictFunOrderbookTradePrice01(args.orderbook, args.side);
  if (fromOutcome > 0) return fromOutcome;
  if (fromBook > 0) return fromBook;
  return 0;
}
