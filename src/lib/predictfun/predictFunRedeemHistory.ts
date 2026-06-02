import type { PredictFunModalTradeRow } from "@/lib/predictfun/parsePredictFunModalApi";
import type { PredictFunPositionRedeemParams } from "@/lib/predictfun/parsePredictFunRedeem";

const REDEEM_LOCK_PREFIX = "predictfun_redeem_locks:";
const REDEEM_LOCK_TTL_MS = 5 * 60 * 1000;

export function buildPredictFunRedeemLockKey(
  params: PredictFunPositionRedeemParams
): string {
  return `${params.conditionId}:${params.indexSet}:${params.isNegRisk ? 1 : 0}:${params.isYieldBearing ? 1 : 0}`;
}

export function readPredictFunRedeemLocks(
  walletAddress: string | undefined,
  chainId: number
): Set<string> {
  if (!walletAddress || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(
      `${REDEEM_LOCK_PREFIX}${walletAddress.toLowerCase()}:${chainId}`
    );
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    return new Set(
      Object.entries(parsed)
        .filter(([, exp]) => Number.isFinite(exp) && exp > now)
        .map(([k]) => k)
    );
  } catch {
    return new Set();
  }
}

export function writePredictFunRedeemLock(
  walletAddress: string,
  chainId: number,
  keys: Set<string>
): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const obj: Record<string, number> = {};
  keys.forEach((k) => {
    obj[k] = now + REDEEM_LOCK_TTL_MS;
  });
  localStorage.setItem(
    `${REDEEM_LOCK_PREFIX}${walletAddress.toLowerCase()}:${chainId}`,
    JSON.stringify(obj)
  );
}

export type PredictFunRedeemHistoryEntry = {
  key: string;
  marketId: string;
  marketTitle: string;
  slugForLink: string;
  outcome: string;
  shares: number;
  txHash?: string;
  redeemedAt: number;
};

const STORAGE_PREFIX = "predictfun_redeem_history:";

function storageKey(walletAddress: string, chainId: number): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}:${chainId}`;
}

export function readPredictFunRedeemHistory(
  walletAddress: string | undefined,
  chainId: number
): PredictFunRedeemHistoryEntry[] {
  if (!walletAddress || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(walletAddress, chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PredictFunRedeemHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendPredictFunRedeemHistory(
  walletAddress: string,
  chainId: number,
  entry: PredictFunRedeemHistoryEntry
): void {
  if (typeof window === "undefined") return;
  const prev = readPredictFunRedeemHistory(walletAddress, chainId);
  const next = [entry, ...prev.filter((e) => e.key !== entry.key)].slice(0, 100);
  localStorage.setItem(storageKey(walletAddress, chainId), JSON.stringify(next));
}

export function redeemHistoryToTradeRows(
  entries: PredictFunRedeemHistoryEntry[]
): PredictFunModalTradeRow[] {
  return entries.map((e) => ({
    key: `redeem-${e.key}`,
    marketId: e.marketId,
    marketTitle: e.marketTitle,
    slugForLink: e.slugForLink,
    sideLabel: `REDEEM ${e.outcome}`.trim(),
    sideTone: "neutral" as const,
    priceDisplay: "—",
    sizeDisplay: e.shares.toLocaleString(undefined, { maximumFractionDigits: 4 }),
    role: "—",
    statusLabel: "REDEEMED",
    statusStyle: "confirmed" as const,
    timeStr: new Date(e.redeemedAt).toLocaleString(),
    sortTime: e.redeemedAt,
  }));
}
