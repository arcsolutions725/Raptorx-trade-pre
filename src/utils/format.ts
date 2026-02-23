export const formatAddress = (address: string, startChars = 6, endChars = 4) =>
  `${address.slice(0, startChars)}...${address.slice(-endChars)}`;

export const formatPrice = (price: number) => `${Math.round(price * 100)}¢`;

export const formatCurrency = (value: number, decimals = 2) =>
  `$${value.toFixed(decimals)}`;

export const formatVolume = (volumeUSD: number) => {
  if (volumeUSD >= 1_000_000) return `$${(volumeUSD / 1_000_000).toFixed(2)}M`;
  if (volumeUSD >= 1_000) return `$${(volumeUSD / 1_000).toFixed(1)}K`;
  return `$${volumeUSD.toFixed(0)}`;
};

export const formatLiquidity = (liquidityUSD: number) => {
  if (liquidityUSD >= 1_000_000)
    return `$${(liquidityUSD / 1_000_000).toFixed(2)}M`;
  if (liquidityUSD >= 1_000) return `$${(liquidityUSD / 1_000).toFixed(0)}K`;
  return `$${liquidityUSD.toFixed(0)}`;
};

export const formatPercentage = (value: number, decimals = 1) =>
  `${value.toFixed(decimals)}%`;

export const formatShares = (shares: number, decimals = 2) =>
  shares.toFixed(decimals);

export function toNumber(n: unknown): number | null {
  if (n == null) return null;
  const num = typeof n === "string" ? Number(n) : (n as number);
  return Number.isFinite(num) ? num : null;
}

export function formatUsd(n: unknown): string {
  const v = toNumber(n);
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
}

/**
 * Transforms a series title to URL-friendly format
 * Example: "hurricane hits florida" -> "hurricane-hits-florida"
 */
export function transformSeriesTitleToUrl(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special characters except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

export function parseDateLike(d: unknown): Date | null {
  if (!d && d !== 0) return null;
  if (typeof d === "number" && d < 1e12) return new Date(d * 1000);
  if (typeof d === "number") return new Date(d);
  if (typeof d === "string") {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export function timeSince(date: Date | null): string {
  if (!date) return "—";
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString();
}