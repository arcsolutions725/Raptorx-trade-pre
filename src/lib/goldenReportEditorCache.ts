/**
 * Client cache for GET /api/golden-reports/editor — reduces repeat calls when
 * switching to the Golden Report tab in Account modal.
 */

export type GoldenEditorProjectCache = {
  contractAddress: string;
  chain: string;
  teamUpdatesContent: string;
  teamUpdatesPublishedAt: string | null;
};

type CacheEnvelope = {
  v: 1;
  fetchedAt: number;
  projects: GoldenEditorProjectCache[];
};

const STORAGE_KEY_PREFIX = "raptorx_golden_editor_v1:";

/** After this age, the next Golden Report tab open refetches from the API once. */
export const GOLDEN_EDITOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function key(userId: string) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function readGoldenEditorCache(
  userId: string,
): CacheEnvelope | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (parsed?.v !== 1 || !Array.isArray(parsed.projects)) return null;
    if (typeof parsed.fetchedAt !== "number") return null;
    return {
      v: 1,
      fetchedAt: parsed.fetchedAt,
      projects: parsed.projects.map((p) => ({
        contractAddress: String(p.contractAddress ?? ""),
        chain: String(p.chain ?? "solana"),
        teamUpdatesContent: String(p.teamUpdatesContent ?? ""),
        teamUpdatesPublishedAt:
          p.teamUpdatesPublishedAt === null ||
          p.teamUpdatesPublishedAt === undefined
            ? null
            : String(p.teamUpdatesPublishedAt),
      })),
    };
  } catch {
    return null;
  }
}

export function writeGoldenEditorCache(
  userId: string,
  projects: GoldenEditorProjectCache[],
  fetchedAt: number = Date.now(),
) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const env: CacheEnvelope = { v: 1, fetchedAt, projects };
    localStorage.setItem(key(userId), JSON.stringify(env));
  } catch {
    // quota / private mode
  }
}

export function clearGoldenEditorCache(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* ignore */
  }
}

export function isGoldenEditorCacheFresh(
  envelope: CacheEnvelope,
  ttlMs: number = GOLDEN_EDITOR_CACHE_TTL_MS,
): boolean {
  return Date.now() - envelope.fetchedAt < ttlMs;
}
