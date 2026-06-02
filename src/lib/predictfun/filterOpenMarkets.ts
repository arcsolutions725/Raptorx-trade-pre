/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Listing filters mirror predict.fun/markets:
 * Status = Open, Sort = Popular, Closing date = Any Time (no endsAt window on our side).
 */

export function isPredictFunCategoryActive(cat: any): boolean {
  if (!cat || typeof cat !== "object") return false;
  const status = String(cat.status ?? "").toUpperCase();
  // Keep categories that are currently tradable/live; exclude only terminal states.
  return (
    status === "OPEN" ||
    status === "ACTIVE" ||
    status === "LIVE" ||
    status === "REGISTERED"
  );
}

/** Tradable markets: include live/in-play; exclude terminal statuses only. */
export function isPredictFunMarketOpen(m: any): boolean {
  if (!m || typeof m !== "object") return false;
  const trading = String(m.tradingStatus ?? m.trading_status ?? "").toUpperCase();
  const st = String(m.status ?? "").toUpperCase();

  // Predict.fun main listing includes live/in-play markets. Only filter terminal states.
  const terminalTradingStates = new Set([
    "CLOSED",
    "RESOLVED",
    "SETTLED",
    "ENDED",
    "EXPIRED",
    "CANCELLED",
    "CANCELED",
    "REMOVED",
  ]);
  if (trading && terminalTradingStates.has(trading)) return false;

  const terminalMarketStates = new Set([
    "CLOSED",
    "RESOLVED",
    "SETTLED",
    "EXPIRED",
    "CANCELLED",
    "CANCELED",
    "REMOVED",
    "ARCHIVED",
  ]);
  if (terminalMarketStates.has(st)) return false;

  return true;
}

/** Flatten markets from OPEN categories; dedupe by market id. */
export function flattenOpenMarketsFromCategories(categories: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const cat of categories) {
    if (!isPredictFunCategoryActive(cat)) continue;
    const markets = Array.isArray(cat.markets) ? cat.markets : [];
    for (const m of markets) {
      if (!isPredictFunMarketOpen(m)) continue;
      const id = String(m.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(m);
    }
  }
  return out;
}

export function parsePredictFunTagId(raw: string | null | undefined): string | null {
  if (!raw || String(raw).trim().toLowerCase() === "all") return null;
  const s = String(raw).trim();
  if (s.toLowerCase() === "trending") return null;
  if (s === "predictfun:all" || s === "predictfun:trending") return null;
  if (s.startsWith("predictfun:")) return s.slice("predictfun:".length);
  return /^\d+$/.test(s) ? s : null;
}
