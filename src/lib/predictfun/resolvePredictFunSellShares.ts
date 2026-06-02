/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  extractPredictFunPositionsList,
  predictFunPositionShares,
} from "@/lib/predictfun/parsePredictFunPositions";
import { shouldShowPredictFunPositionInList } from "@/lib/predictfun/parsePredictFunRedeem";
import { isPredictFunMarketTradable } from "@/lib/predictfun/predictFunMarketLifecycle";

export type PredictFunSellSharesFilter = {
  marketId: string;
  marketTitle?: string | null;
  categorySlug?: string | null;
  /** Parent category id / slug when viewing a child market under a category. */
  relatedMarketIds?: string[];
  selectedOutcomeTitle?: string | null;
  selectedTokenId?: string | null;
};

function normalizeId(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeTitle(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function positionTokenId(raw: any): string {
  return normalizeId(
    raw?.tokenId ??
      raw?.token_id ??
      raw?.outcome?.onChainId ??
      raw?.outcome?.on_chain_id ??
      raw?.outcome?.tokenId
  );
}

function positionMarketIds(raw: any): string[] {
  const market = raw?.market ?? raw?.category ?? {};
  return [
    normalizeId(raw?.marketId),
    normalizeId(raw?.market_id),
    normalizeId(market?.id),
    normalizeId(market?.marketId),
    normalizeId(market?.slug),
    normalizeId(market?.categorySlug),
  ].filter(Boolean);
}

function positionOutcomeName(raw: any): string {
  const o = raw?.outcome;
  if (o && typeof o === "object") {
    return normalizeTitle(o?.name ?? o?.title);
  }
  return normalizeTitle(raw?.outcome ?? raw?.outcomeName ?? raw?.name);
}

/** Yes/Up and No/Down are equivalent on Predict.fun short-term markets. */
function outcomeNamesMatch(selected: string, position: string): boolean {
  if (!selected || !position) return true;
  if (selected === position) return true;
  const yesLike = new Set(["yes", "up"]);
  const noLike = new Set(["no", "down"]);
  if (yesLike.has(selected) && yesLike.has(position)) return true;
  if (noLike.has(selected) && noLike.has(position)) return true;
  return false;
}

function positionShares(raw: any): number {
  return predictFunPositionShares(raw);
}

function positionMatchesMarket(raw: any, filter: PredictFunSellSharesFilter): boolean {
  const ids = new Set(
    [
      normalizeId(filter.marketId),
      normalizeId(filter.categorySlug),
      ...(filter.relatedMarketIds ?? []),
    ].filter(Boolean)
  );

  const posIds = positionMarketIds(raw);
  if (posIds.some((id) => ids.has(id))) return true;

  const filterTitle = normalizeTitle(filter.marketTitle);
  const posTitle = normalizeTitle(
    raw?.marketTitle ??
      raw?.market_title ??
      raw?.market?.title ??
      raw?.market?.question ??
      raw?.title
  );
  if (filterTitle && posTitle && (filterTitle === posTitle || posTitle.includes(filterTitle) || filterTitle.includes(posTitle))) {
    return true;
  }

  return false;
}

function positionMatchesOutcome(raw: any, filter: PredictFunSellSharesFilter): boolean {
  const selected = normalizeTitle(filter.selectedOutcomeTitle);
  if (!selected) return true;

  const tokenId = normalizeId(filter.selectedTokenId);
  const posToken = positionTokenId(raw);
  if (tokenId && posToken && tokenId === posToken) return true;

  return outcomeNamesMatch(selected, positionOutcomeName(raw));
}

/** Sum sellable shares for the active market + outcome from GET /v1/positions (JWT). */
export function resolvePredictFunSellableShares(
  positionsBody: unknown,
  filter: PredictFunSellSharesFilter
): number {
  const list = extractPredictFunPositionsList(positionsBody);
  if (!list.length) return 0;

  let total = 0;
  for (const p of list) {
    if (!positionMatchesMarket(p, filter)) continue;
    if (!positionMatchesOutcome(p, filter)) continue;
    const market = p?.market ?? p?.category;
    // Sell only applies to open markets; resolved losers are not sellable.
    if (!isPredictFunMarketTradable(market)) continue;
    if (!shouldShowPredictFunPositionInList(p, market)) continue;
    total += positionShares(p);
  }

  if (total > 0) return total;

  // Token-only fallback (market id mismatch across category vs child market).
  const tokenId = normalizeId(filter.selectedTokenId);
  if (!tokenId) return 0;
  for (const p of list) {
    if (positionTokenId(p) !== tokenId) continue;
    const market = p?.market ?? p?.category;
    if (!isPredictFunMarketTradable(market)) continue;
    if (!shouldShowPredictFunPositionInList(p, market)) continue;
    total += positionShares(p);
  }

  return Number.isFinite(total) ? total : 0;
}
