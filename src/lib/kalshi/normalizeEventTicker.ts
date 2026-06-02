/**
 * Kalshi REST paths are case-sensitive; canonical tickers are uppercase (e.g. KXGOVTSHUTLENGTH-26FEB07).
 * kalshi.com URLs often use lowercase segments — normalize before calling the API.
 */
export function normalizeKalshiEventTicker(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}
