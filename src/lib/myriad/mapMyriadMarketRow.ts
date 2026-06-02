/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LimitlessMarket } from "@/hooks/useLimitlessMarkets";

type MyriadOutcome = {
  id?: number;
  title?: string;
  price?: number;
  shares?: number;
};

type MyriadApiMarket = {
  id: number | string;
  networkId?: number;
  /** 0 = AMM, 1 = order book */
  executionMode?: number;
  slug?: string;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  outcomes?: MyriadOutcome[];
};

function centsDisplay(prob: number | null | undefined): number | string {
  if (prob == null || !Number.isFinite(prob)) return "—";
  return prob * 100;
}

/**
 * Map Myriad GET /markets item to the Limitless-shaped row used by Rex table/cards.
 */
export function mapMyriadApiMarketToRow(raw: MyriadApiMarket): LimitlessMarket & {
  _source: "myriad";
  slug: string;
  networkId?: number;
} {
  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  const isBinary = outcomes.length === 2;

  let yesPrice: string | number = "—";
  let noPrice: string | number = "—";
  let choiceI: string | number = "—";
  let choiceII: string | number = "—";

  if (isBinary) {
    const a = outcomes[0]?.price;
    const b = outcomes[1]?.price;
    yesPrice = centsDisplay(a ?? null);
    noPrice = centsDisplay(b ?? null);
    choiceI = yesPrice;
    choiceII = noPrice;
  } else if (outcomes.length >= 2) {
    const byPrice = [...outcomes].sort(
      (x, y) => (y.price ?? 0) - (x.price ?? 0)
    );
    choiceI = centsDisplay(byPrice[0]?.price ?? null);
    choiceII = centsDisplay(byPrice[1]?.price ?? null);
  }

  const markets =
    outcomes.length > 2
      ? outcomes.map((o) => ({
          outcomePrices: JSON.stringify([o.price ?? 0, 1 - (o.price ?? 0)]),
          title: o.title,
          volume24hr: o.shares ?? 0,
          volume: o.shares ?? 0,
        }))
      : isBinary
        ? [
            {
              outcomePrices: JSON.stringify([
                outcomes[0]?.price ?? 0,
                outcomes[1]?.price ?? 0,
              ]),
              title: raw.title,
              volume24hr: raw.volume24h ?? raw.volume ?? 0,
            },
          ]
        : outcomes.length === 1
          ? [
              {
                outcomePrices: JSON.stringify([outcomes[0]?.price ?? 0]),
                title: outcomes[0]?.title ?? raw.title,
                volume24hr: raw.volume24h ?? raw.volume ?? 0,
              },
            ]
          : [];

  const slug = String(raw.slug ?? raw.id);

  return {
    id: String(raw.id),
    ticker: slug,
    slug,
    title: raw.title ?? slug,
    description: raw.description,
    image: raw.imageUrl ?? undefined,
    icon: raw.imageUrl ?? undefined,
    active: true,
    closed: false,
    archived: false,
    volume: Number(raw.volume ?? 0),
    volume24hr: Number(raw.volume24h ?? 0),
    liquidity: Number(raw.liquidity ?? 0),
    markets,
    yesPrice,
    noPrice,
    choiceI,
    choiceII,
    rawEventData: {
      networkId: raw.networkId,
      executionMode: raw.executionMode,
      outcomes: raw.outcomes,
    },
    _source: "myriad",
    networkId: raw.networkId,
  };
}
