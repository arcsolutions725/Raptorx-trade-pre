/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber, utils } from "ethers";
import type { PredictFunMarketFlags } from "@/lib/predictfun/orderEip712";
import { isPredictFunMarketResolved } from "@/lib/predictfun/predictFunMarketLifecycle";
import { predictFunPositionShares } from "@/lib/predictfun/parsePredictFunPositions";

export type PredictFunPositionRedeemParams = {
  conditionId: string;
  indexSet: 1 | 2;
  amountWei: bigint;
} & PredictFunMarketFlags;

export function predictFunPositionMarketFlags(raw: any): PredictFunMarketFlags {
  const market = raw?.market ?? raw?.category ?? {};
  return {
    isNegRisk: Boolean(raw?.isNegRisk ?? market?.isNegRisk ?? false),
    isYieldBearing: Boolean(raw?.isYieldBearing ?? market?.isYieldBearing ?? false),
  };
}

function normalizeConditionId(value: unknown): string | null {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;
  if (!s.startsWith("0x")) s = `0x${s}`;
  const hex = s.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length > 64) s = `0x${hex.slice(-64)}`;
  else if (hex.length < 64) s = `0x${hex.padStart(64, "0")}`;
  return s;
}

function outcomeNameToIndexSet(name: string): 1 | 2 | null {
  const n = name.trim().toLowerCase();
  if (["yes", "up", "y"].includes(n)) return 1;
  if (["no", "down", "n"].includes(n)) return 2;
  return null;
}

export function readPredictFunPositionIndexSet(raw: any): 1 | 2 | null {
  const outcome = raw?.outcome;
  const candidates = [
    raw?.indexSet,
    raw?.index_set,
    outcome?.indexSet,
    outcome?.index_set,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (n === 1 || n === 2) return n;
  }
  const name = String(
    outcome?.name ?? (typeof raw?.outcome === "string" ? raw.outcome : "") ?? ""
  ).trim();
  return outcomeNameToIndexSet(name);
}

/** Winning outcome index on a resolved market (from API fields or settled prices). */
export function readPredictFunWinningIndexSet(market: any): 1 | 2 | null {
  if (!market || typeof market !== "object") return null;

  const direct = Number(
    market?.winningIndexSet ??
      market?.winning_index_set ??
      market?.resolvedIndexSet ??
      market?.resolved_index_set
  );
  if (direct === 1 || direct === 2) return direct;

  const winningName = String(
    market?.winningOutcome ??
      market?.winning_outcome ??
      market?.resolvedOutcome ??
      market?.resolved_outcome ??
      ""
  ).trim();
  const fromName = outcomeNameToIndexSet(winningName);
  if (fromName) return fromName;

  const outs = Array.isArray(market?.outcomes) ? market.outcomes : [];
  for (const o of outs) {
    if (o?.won === true || o?.isWinner === true) {
      const idx = readPredictFunPositionIndexSet({ outcome: o, indexSet: o?.indexSet });
      if (idx) return idx;
    }
    const payout = Number(o?.payout ?? o?.payoutNumerator ?? o?.payout_numerator);
    if (payout === 1) {
      const idx = readPredictFunPositionIndexSet({ outcome: o, indexSet: o?.indexSet });
      if (idx) return idx;
    }
  }

  // Settled binary market: outcome trading at ~$1 is the winner.
  for (const o of outs) {
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
    if (mid >= 0.99) {
      const idx = readPredictFunPositionIndexSet({ outcome: o, indexSet: o?.indexSet });
      if (idx) return idx;
    }
  }

  return null;
}

function readIndexSet(raw: any): 1 | 2 | null {
  return readPredictFunPositionIndexSet(raw);
}

const ZERO_WEI = BigInt(0);

function readAmountWei(raw: any): bigint {
  const candidates = [
    raw?.balance,
    raw?.amount,
    raw?.sharesWei,
    raw?.shareAmount,
    raw?.tokenAmount,
    raw?.outcome?.balance,
    raw?.outcome?.amount,
  ];
  for (const v of candidates) {
    if (v == null) continue;
    try {
      if (typeof v === "bigint") return v > ZERO_WEI ? v : ZERO_WEI;
      const s = String(v).trim();
      if (!s) continue;
      if (/^\d+$/.test(s)) {
        const wei = BigInt(s);
        return wei > ZERO_WEI ? wei : ZERO_WEI;
      }
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        return BigNumber.from(utils.parseUnits(String(v), 18)).toBigInt();
      }
    } catch {
      continue;
    }
  }
  return ZERO_WEI;
}

function isExplicitlyLosingPosition(raw: any, marketContext?: any): boolean {
  const outcome = raw?.outcome;
  if (raw?.isWinner === false || raw?.won === false) return true;
  if (outcome?.isWinner === false || outcome?.won === false) return true;
  const status = String(outcome?.status ?? raw?.outcomeStatus ?? "").toUpperCase();
  if (["LOST", "LOSER", "LOSS", "NOT_WON"].includes(status)) return true;
  if (raw?.redeemable === false || outcome?.redeemable === false) {
    const market = raw?.market ?? raw?.category ?? marketContext ?? {};
    if (isPredictFunMarketResolved(market)) return true;
  }

  const market = raw?.market ?? raw?.category ?? marketContext;
  if (market && isPredictFunMarketResolved(market)) {
    const winning = readPredictFunWinningIndexSet(market);
    const posIdx = readPredictFunPositionIndexSet(raw);
    if (winning && posIdx && winning !== posIdx) return true;
  }

  return false;
}

/** Whether the API / market metadata indicates this position can be redeemed. */
export function predictFunPositionRedeemEligible(
  raw: any,
  marketContext?: any
): boolean {
  if (isExplicitlyLosingPosition(raw, marketContext)) return false;

  if (
    raw?.redeemable === true ||
    raw?.canRedeem === true ||
    raw?.winningsToClaim === true ||
    raw?.voidedWinningsToClaim === true ||
    raw?.outcome?.redeemable === true ||
    raw?.outcome?.canRedeem === true ||
    raw?.outcome?.winningsToClaim === true ||
    raw?.outcome?.voidedWinningsToClaim === true ||
    raw?.isWinner === true ||
    raw?.won === true ||
    raw?.outcome?.isWinner === true ||
    raw?.outcome?.won === true
  ) {
    return parsePredictFunPositionRedeemParams(raw) != null;
  }

  const market = raw?.market ?? raw?.category ?? marketContext ?? raw;
  if (!isPredictFunMarketResolved(market)) return false;

  const shares = predictFunPositionShares(raw);
  if (shares <= 0) return false;

  const winning = readPredictFunWinningIndexSet(market);
  const posIdx = readPredictFunPositionIndexSet(raw);
  if (winning && posIdx && winning === posIdx) {
    return parsePredictFunPositionRedeemParams(raw) != null;
  }

  return false;
}

/**
 * Positions tab: open markets with shares, or resolved markets with redeemable winnings.
 * Losing resolved positions belong in trade history only (not listed here).
 */
function resolveMarketContext(raw: any, marketContext?: any): any {
  return marketContext ?? raw?.market ?? raw?.category ?? raw;
}

export function shouldShowPredictFunPositionInList(
  raw: any,
  marketContext?: any
): boolean {
  const shares = predictFunPositionShares(raw);
  if (shares <= 0) return false;

  const ctx = resolveMarketContext(raw, marketContext);
  if (isPredictFunMarketResolved(ctx)) {
    return predictFunPositionRedeemEligible(raw, ctx);
  }

  return true;
}

/** Build on-chain redeem params from a GET /positions row (per Predict SDK docs). */
export function parsePredictFunPositionRedeemParams(
  raw: any
): PredictFunPositionRedeemParams | null {
  const market = raw?.market ?? raw?.category ?? {};
  const conditionId =
    normalizeConditionId(raw?.conditionId) ??
    normalizeConditionId(raw?.condition_id) ??
    normalizeConditionId(market?.conditionId) ??
    normalizeConditionId(market?.condition_id);
  const indexSet = readIndexSet(raw);
  if (!conditionId || !indexSet) return null;

  const flags = predictFunPositionMarketFlags(raw);
  const amountWei = readAmountWei(raw);
  if (flags.isNegRisk && amountWei <= ZERO_WEI) return null;

  return {
    conditionId,
    indexSet,
    amountWei,
    ...flags,
  };
}
