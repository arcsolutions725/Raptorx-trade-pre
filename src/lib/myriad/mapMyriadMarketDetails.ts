/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MarketDetails, MarketOutcome } from "@/hooks/useMarketDetails";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";
import {
  readMyriadNetworkId,
  readOutcomeEthMarketId,
  readRootChainMarketId,
  parseMyriadUintField,
  deriveChainMarketIdFromOutcomeTokenId,
} from "@/lib/myriad/resolveMyriadTradingIds";

function readExecutionMode(rec: Record<string, unknown>): number {
  const v = rec.executionMode ?? rec.execution_mode;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return 0;
}

export type MyriadOutcomeCharts = {
  timeframe: string;
  prices?: unknown;
  change_percent?: number;
};

export type MyriadOutcomeDetail = {
  id: number;
  title?: string;
  price: number;
  shares?: number;
  sharesHeld?: number;
  imageUrl?: string | null;
  tokenId?: string;
  holders?: number;
  price_charts?: MyriadOutcomeCharts[];
  /** On-chain market id for this outcome’s binary OB market (NegRisk / multi-outcome). */
  ethMarketId?: number;
};

export type MyriadMarketCollateralToken = {
  address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
};

export type MyriadMarketDetailApi = {
  id: number | string;
  networkId?: number;
  slug?: string;
  /** Collateral ERC20 for AMM trades (approve + transferFrom). */
  token?: MyriadMarketCollateralToken;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  state?: string;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  topics?: string[];
  expiresAt?: string | null;
  outcomes?: MyriadOutcomeDetail[];
  [key: string]: unknown;
};

export function mapMyriadMarketDetailToMarketDetails(raw: MyriadMarketDetailApi): MarketDetails & {
  slug: string;
  myriadNetworkId: number;
  myriadMarketId: number;
  myriadExecutionMode: number;
  myriadIsOrderBook: boolean;
  rawEventData: MyriadMarketDetailApi;
} {
  const rawRec = raw as unknown as Record<string, unknown>;
  const executionMode = readExecutionMode(rawRec);
  const slug = String(raw.slug ?? raw.id);
  const networkIdRaw = readMyriadNetworkId(rawRec);
  const networkId = networkIdRaw > 0 ? networkIdRaw : MYRIAD_ORDER_BOOK_CHAIN_ID;
  const rawOutcomes = Array.isArray(raw.outcomes) ? raw.outcomes : [];
  let chainMarketId = readRootChainMarketId(rawRec);
  if (chainMarketId === 0 && rawOutcomes.length > 0) {
    const fo = rawOutcomes[0] as unknown as Record<string, unknown>;
    const fromTok = deriveChainMarketIdFromOutcomeTokenId(fo.tokenId);
    if (fromTok != null) chainMarketId = fromTok;
  }
  if (chainMarketId === 0 && rawOutcomes.length > 0) {
    for (const o of rawOutcomes) {
      const rec = o as unknown as Record<string, unknown>;
      const eth = readOutcomeEthMarketId(rec);
      if (eth !== undefined && eth > 0) {
        chainMarketId = eth;
        break;
      }
    }
  }
  const displayId = parseMyriadUintField(raw.id) ?? chainMarketId;
  const outcomes: MyriadOutcomeDetail[] = rawOutcomes.map((o) => {
    const rec = o as unknown as Record<string, unknown>;
    const eth = readOutcomeEthMarketId(rec);
    return eth !== undefined ? { ...(o as MyriadOutcomeDetail), ethMarketId: eth } : (o as MyriadOutcomeDetail);
  });
  const vol = Number(raw.volume24h ?? raw.volume ?? 0);

  const markets: MarketOutcome[] = outcomes.map((o) => {
    const p = Number(o.price ?? 0);
    return {
      ticker: `outcome-${o.id}`,
      market_id: String(o.id),
      subtitle: o.title ?? `Outcome ${o.id}`,
      groupItemTitle: o.title,
      probability: p,
      yes_price: p,
      no_price: Math.max(0, Math.min(1, 1 - p)),
      volume: vol / Math.max(1, outcomes.length),
      yes_bid: p,
      yes_ask: p,
      liquidity: Number(raw.liquidity ?? 0) / Math.max(1, outcomes.length),
      open_interest: 0,
      status: raw.state ?? "open",
      condition_id: String(o.id),
    };
  });

  if (markets.length === 0) {
    markets.push({
      ticker: slug,
      subtitle: raw.title ?? slug,
      probability: 0.5,
      yes_price: 0.5,
      no_price: 0.5,
      volume: vol,
      yes_bid: 0.5,
      yes_ask: 0.5,
      liquidity: Number(raw.liquidity ?? 0),
      open_interest: 0,
      status: raw.state ?? "open",
    });
  }

  const firstProb = markets[0]?.yes_price ?? 0.5;
  const secondProb = markets[1]?.yes_price ?? Math.max(0, 1 - firstProb);

  return {
    series_ticker: slug,
    title: raw.title ?? slug,
    subtitle: outcomes[0]?.title,
    category: Array.isArray(raw.topics) && raw.topics.length ? String(raw.topics[0]) : "Myriad",
    markets,
    total_volume: vol,
    total_series_volume: vol,
    symbol_image_url: raw.imageUrl ?? "",
    close_time: raw.expiresAt ?? null,
    expected_expiration_time: raw.expiresAt ?? null,
    event_ticker: slug,
    ticker: slug,
    id: String(displayId || slug),
    event_id: null,
    description: typeof raw.description === "string" ? raw.description : undefined,
    liquidity: Number(raw.liquidity ?? 0),
    yesPrice: outcomes.length <= 2 ? firstProb : firstProb,
    noPrice: outcomes.length === 2 ? secondProb : undefined,
    prices: outcomes.length <= 2 ? [firstProb, secondProb] : outcomes.map((o) => Number(o.price ?? 0)),
    slug,
    myriadNetworkId: networkId,
    myriadMarketId: chainMarketId,
    myriadExecutionMode: executionMode,
    myriadIsOrderBook: executionMode === 1,
    rawEventData: { ...raw, outcomes },
  };
}
