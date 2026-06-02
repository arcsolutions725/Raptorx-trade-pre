/** Whether `createdAt` is a plausible token-creation unix timestamp (seconds). */
export function hasUsableTokenCreatedAt(createdAt?: unknown): boolean {
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt) || createdAt <= 0) {
    return false;
  }
  const sec = createdAt > 1e12 ? Math.floor(createdAt / 1000) : createdAt;
  const maxSec = Math.floor(Date.now() / 1000) + 86_400;
  return sec > 946684800 && sec <= maxSec;
}

export function normalizeCreatedAtSeconds(createdAt?: unknown): number | undefined {
  if (!hasUsableTokenCreatedAt(createdAt)) return undefined;
  const n = createdAt as number;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

export function lookupScreenerAge(
  ages: Record<string, number | undefined> | undefined,
  tokenAddress?: string,
): number | undefined {
  const addr = tokenAddress?.trim();
  if (!addr || !ages) return undefined;
  const raw = ages[addr] ?? (addr.startsWith("0x") ? ages[addr.toLowerCase()] : undefined);
  return normalizeCreatedAtSeconds(raw);
}

export function mergeScreenerTokenAges<T extends { tokenAddress?: string; createdAt?: number }>(
  items: T[],
  ages: Record<string, number | undefined> | undefined,
): T[] {
  if (!ages || !Object.keys(ages).length) return items;
  return items.map((row) => {
    if (hasUsableTokenCreatedAt(row.createdAt)) return row;
    const merged = lookupScreenerAge(ages, row.tokenAddress);
    if (merged === undefined) return row;
    return { ...row, createdAt: merged };
  });
}
