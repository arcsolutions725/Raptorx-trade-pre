/* eslint-disable @typescript-eslint/no-explicit-any */
import { extractPredictFunPositionsList } from "@/lib/predictfun/parsePredictFunPositions";
import {
  parsePredictFunPositionRedeemParams,
  predictFunPositionRedeemEligible,
  shouldShowPredictFunPositionInList,
  type PredictFunPositionRedeemParams,
} from "@/lib/predictfun/parsePredictFunRedeem";
import {
  type PredictFunSellSharesFilter,
  resolvePredictFunSellableShares,
} from "@/lib/predictfun/resolvePredictFunSellShares";

export type PredictFunMarketPositionContext = {
  raw: any;
  shares: number;
  redeemParams: PredictFunPositionRedeemParams | null;
  redeemEligible: boolean;
  outcomeLabel: string;
};

function positionMatchesFilter(
  raw: any,
  filter: PredictFunSellSharesFilter
): boolean {
  return resolvePredictFunSellableShares({ success: true, data: { positions: [raw] } }, filter) > 0;
}

function outcomeLabelFromRaw(raw: any): string {
  const o = raw?.outcome;
  if (o && typeof o === "object") {
    return String(o?.name ?? o?.title ?? "Outcome").trim() || "Outcome";
  }
  return String(raw?.outcome ?? raw?.outcomeName ?? raw?.name ?? "Outcome").trim() || "Outcome";
}

/** Best matching open position row for the active market + outcome. */
export function findPredictFunMarketPosition(
  positionsBody: unknown,
  filter: PredictFunSellSharesFilter,
  marketContext?: any
): PredictFunMarketPositionContext | null {
  const list = extractPredictFunPositionsList(positionsBody);
  let best: any = null;
  let bestShares = 0;

  for (const p of list) {
    if (!positionMatchesFilter(p, filter)) continue;
    if (!shouldShowPredictFunPositionInList(p, marketContext ?? p?.market ?? p?.category)) {
      continue;
    }
    const shares = resolvePredictFunSellableShares(
      { success: true, data: { positions: [p] } },
      filter
    );
    if (shares > bestShares) {
      best = p;
      bestShares = shares;
    }
  }

  if (!best || bestShares <= 0) return null;

  const redeemParams = parsePredictFunPositionRedeemParams(best);
  return {
    raw: best,
    shares: bestShares,
    redeemParams,
    redeemEligible: redeemParams
      ? predictFunPositionRedeemEligible(best, marketContext)
      : false,
    outcomeLabel: outcomeLabelFromRaw(best),
  };
}
