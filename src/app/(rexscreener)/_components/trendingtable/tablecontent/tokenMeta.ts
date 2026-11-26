import type { TrendingToken } from "@/hooks/useTrendingTokens";

/** Shared display helpers for the screener row, the Golden / Pump cards and the token view. */

export function fromEpochSeconds(sec?: number): Date | null {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  // Safety net: detect millisecond timestamps (> ~2001 in ms ≈ 1e12)
  const normalized = sec > 1e12 ? Math.floor(sec / 1000) : sec;
  return new Date(normalized * 1000);
}

export function timeSince(date: Date | null): string {
  if (!date) return "—";
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  // Mean Gregorian year (~365.25d) + round so ~2y elapsed matches "2 years ago" UIs (floor was ~1y for ~710d).
  const secPerYear = 365.25 * 24 * 3600;
  const approxYears = s / secPerYear;
  if (approxYears >= 1) {
    const y = Math.max(1, Math.round(approxYears));
    return `${y}y`;
  }
  const mo = Math.floor(s / (30 * 24 * 3600));
  if (mo >= 1) return `${mo}mo`;
  const w = Math.floor(s / (7 * 24 * 3600));
  if (w >= 1) return `${w}w`;
  const d = Math.floor(s / (24 * 3600));
  if (d >= 1) return `${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(s / 60);
  if (m >= 1) return `${m}m`;
  return `${s}s`;
}

export function pickVolume24h(v?: TrendingToken["totalVolume"]): number | undefined {
  return v?.["24h"] ?? v?.["12h"] ?? v?.["4h"] ?? v?.["1h"];
}

export function pct24h(
  block?: TrendingToken["pricePercentChange"] | TrendingToken["volumePercentChange"],
): number | undefined {
  const v = block?.["24h"];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Magnitude string for multiplier X where multiplier = percentChange / 100 (e.g. 800% → 8, −120% → 1.2). */
export function formatMultiplierMagnitudeFromPercent(pct: number): string {
  const a = Math.abs(pct / 100);
  if (a === 0) return "0";
  const decimals = a >= 10 ? 1 : 2;
  return a.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Monogram fallback colour: a stable muted hue per token (no brand colour in the API). */
export function monogramBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 38% 34%)`;
}

export function monogramOf(text: string): string {
  return text.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}

/** Chain badge art + label, keyed off the token's chainId (same mapping as the screener rows). */
export function chainBadgeFor(chainId?: string): { src: string; label: string } {
  const c = chainId?.toLowerCase();
  if (c === "base" || chainId === "8453") return { src: "/images/brands/base.webp", label: "Base" };
  if (c === "ethereum" || c === "eth" || chainId === "1")
    return { src: "/images/ETH_light_logo.webp", label: "Ethereum" };
  if (c === "bsc" || chainId === "56") return { src: "/images/bnbchain.png", label: "BNB Chain" };
  if (c === "monad" || chainId === "10143") return { src: "/images/monad.png", label: "Monad" };
  if (c === "robinhood" || chainId === "4663") return { src: "/images/robinhood.png", label: "Robinhood" };
  return { src: "/images/solana.png", label: "Solana" };
}

/** 0x3119…cf82 */
export function shortAddress(addr: string): string {
  const a = addr.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
