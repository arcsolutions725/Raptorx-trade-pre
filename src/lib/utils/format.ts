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
