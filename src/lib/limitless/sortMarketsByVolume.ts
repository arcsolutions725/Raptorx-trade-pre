/**
 * Sort key for Limitless market rows produced by our API transforms.
 * Prefer human-readable volumeFormatted (matches UI), then numeric volume fields.
 */
export function limitlessVolumeScore(m: any): number {
  if (m?.volumeFormatted != null && String(m.volumeFormatted).trim() !== "") {
    const n = parseFloat(String(m.volumeFormatted).replace(/[$,]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  const v = Number(m?.volume24hr ?? m?.volume ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function sortLimitlessMarketsByVolumeDesc<T>(markets: T[]): T[] {
  return [...markets].sort(
    (a: any, b: any) => limitlessVolumeScore(b) - limitlessVolumeScore(a),
  );
}
