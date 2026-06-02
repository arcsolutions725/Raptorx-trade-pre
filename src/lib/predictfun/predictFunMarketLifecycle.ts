/* eslint-disable @typescript-eslint/no-explicit-any */

const TERMINAL_TRADING = new Set([
  "CLOSED",
  "RESOLVED",
  "SETTLED",
  "ENDED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "REMOVED",
]);

const TERMINAL_STATUS = new Set([
  "CLOSED",
  "RESOLVED",
  "SETTLED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "REMOVED",
  "ARCHIVED",
  "FINALIZED",
]);

function readMarketFields(raw: any): { trading: string; status: string } {
  const m = raw?.market ?? raw?.category ?? raw ?? {};
  return {
    trading: String(m.tradingStatus ?? m.trading_status ?? raw?.tradingStatus ?? "").toUpperCase(),
    status: String(m.status ?? raw?.status ?? "").toUpperCase(),
  };
}

function readEndsAtMs(raw: any): number | null {
  const m = raw?.market ?? raw?.category ?? raw ?? {};
  const endsAt = m.endsAt ?? m.ends_at ?? raw?.endsAt ?? raw?.ends_at;
  if (endsAt == null) return null;
  const t = typeof endsAt === "number" ? endsAt : new Date(String(endsAt)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Market no longer accepts new orders (resolved / closed / expired). */
export function isPredictFunMarketResolved(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  const { trading, status } = readMarketFields(raw);
  if (trading && TERMINAL_TRADING.has(trading)) return true;
  if (status && TERMINAL_STATUS.has(status)) return true;
  const endsMs = readEndsAtMs(raw);
  if (endsMs != null && endsMs < Date.now()) return true;
  return Boolean(
    raw?.resolved === true ||
      raw?.isResolved === true ||
      raw?.market?.resolved === true ||
      raw?.market?.isResolved === true
  );
}

/** Market accepts buy/sell limit orders. */
export function isPredictFunMarketTradable(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  if (isPredictFunMarketResolved(raw)) return false;
  const { trading, status } = readMarketFields(raw);
  if (trading && TERMINAL_TRADING.has(trading)) return false;
  if (status && TERMINAL_STATUS.has(status)) return false;
  if (
    trading === "OPEN" ||
    trading === "ACTIVE" ||
    status === "REGISTERED" ||
    status === "OPEN" ||
    status === "ACTIVE"
  ) {
    return true;
  }
  // Default: tradable unless explicitly terminal (matches filterOpenMarkets).
  return !isPredictFunMarketResolved(raw);
}
