// app/api/trending/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ------- Upstreams -------
const BIRDEYE_TOKENLIST = "https://public-api.birdeye.so/defi/tokenlist";
const BIRDEYE_CREATION =
  "https://public-api.birdeye.so/defi/token_creation_info";
const JUP_VERIFIED_URL = "https://lite-api.jup.ag/tokens/v2/tag?query=verified";

// Birdeye hard cap
const BIRDEYE_PAGE_MAX = 50; // Birdeye requires 1..50

// ------- Known fallbacks -------
// WSOL / NATIVE_MINT (approximate: Solana mainnet-beta genesis, 2020-03-16T00:00:00Z)
const KNOWN_CREATION_TIMES: Record<string, number> = {
  so11111111111111111111111111111111111111112: 1584316800,
};

// ------- Types -------
type ListOk = {
  ok: true;
  tokens: any[];
  meta: {
    total: number;
    updateUnixTime: number | null;
    updateTime: string | null;
  };
};
type ListErr = { ok: false; error: string; status: number };
type ListResult = ListOk | ListErr;

// ------- Caches -------
const CREATION_CACHE = new Map<string, number | null>();
const JUP_VERIFIED_TTL_MS = 10 * 60 * 1000; // 10 min
let JUP_VERIFIED_CACHE: { set: Set<string>; expiresAt: number } | null = null;

// ------- Utils -------
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    active--;
    if (queue.length) queue.shift()!();
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          next();
        }
      };
      if (active < concurrency) start();
      else queue.push(start);
    });
  };
}

function toInt(val: any, def: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(String(val), 10);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return def;
}

function dedupeByAddress(items: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const it of items) {
    const addr = (it?.tokenAddress || "").toLowerCase();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    out.push(it);
  }
  return out;
}

// ------- Normalizers -------
function normalizeTokenlistToken(t: any, chain: string) {
  const address = t?.address ?? t?.mint ?? null;
  const price = typeof t?.price === "number" ? t.price : undefined;

  const marketCap =
    typeof t?.mc === "number"
      ? t.mc
      : typeof t?.marketcap === "number"
      ? t.marketcap
      : typeof t?.fdv === "number"
      ? t.fdv
      : undefined;

  const liquidityUsd =
    typeof t?.liquidity === "number" ? t.liquidity : undefined;

  const v24hUSD =
    typeof t?.v24hUSD === "number"
      ? t.v24hUSD
      : typeof t?.volume24hUSD === "number"
      ? t.volume24hUSD
      : undefined;

  const priceChange24h =
    typeof t?.v24hChangePercent === "number"
      ? t.v24hChangePercent
      : typeof t?.price24hChangePercent === "number"
      ? t.price24hChangePercent
      : undefined;

  const lastTradeUnixTime =
    typeof t?.lastTradeUnixTime === "number" ? t.lastTradeUnixTime : undefined;

  return {
    chainId: chain,
    tokenAddress: address || undefined,
    name: t?.name ?? undefined,
    uniqueName: null,
    symbol: t?.symbol ?? undefined,
    decimals: typeof t?.decimals === "number" ? t.decimals : undefined,
    logo: t?.logoURI ?? t?.logo_uri ?? undefined,

    usdPrice: price,
    marketCap,
    liquidityUsd,

    pricePercentChange: { "24h": priceChange24h },
    totalVolume: { "24h": v24hUSD },

    createdAt: undefined, // set via creation_info enrichment
    lastTradeUnixTime,

    rank: typeof t?.rank === "number" ? t.rank : undefined,
  } as any;
}

// ------- Upstream fetchers -------
async function fetchBirdeyeTokenlist(opts: {
  chain: string;
  limit: number;
  offset: number;
  sort_by: string;
  sort_type: "asc" | "desc";
  min_liquidity: number;
  ui_amount_mode: "raw" | "scaled";
  apiKey: string;
}): Promise<ListResult> {
  const {
    chain,
    limit,
    offset,
    sort_by,
    sort_type,
    min_liquidity,
    ui_amount_mode,
    apiKey,
  } = opts;

  // Clamp to Birdeye's required range 1..50
  const cappedLimit = Math.min(Math.max(1, limit), BIRDEYE_PAGE_MAX);

  const url = new URL(BIRDEYE_TOKENLIST);
  url.searchParams.set("sort_by", sort_by);
  url.searchParams.set("sort_type", sort_type);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(cappedLimit));
  url.searchParams.set("min_liquidity", String(Math.max(0, min_liquidity)));
  url.searchParams.set("ui_amount_mode", ui_amount_mode);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-chain": chain,
        "X-API-KEY": apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: text || `Birdeye HTTP ${res.status}`,
        status: res.status,
      };
    }

    const json = (await res.json()) as any;
    if (!json?.success) {
      return {
        ok: false,
        error: "Birdeye response not successful",
        status: 502,
      };
    }

    const data = json?.data ?? {};
    const tokens: any[] = Array.isArray(data?.tokens) ? data.tokens : [];
    return {
      ok: true,
      tokens,
      meta: {
        total: typeof data?.total === "number" ? data.total : tokens.length,
        updateUnixTime: data?.updateUnixTime ?? null,
        updateTime: data?.updateTime ?? null,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err || "Network error"),
      status: 500,
    };
  }
}

async function getJupiterVerifiedSet(): Promise<Set<string>> {
  const now = Date.now();
  if (JUP_VERIFIED_CACHE && JUP_VERIFIED_CACHE.expiresAt > now) {
    return JUP_VERIFIED_CACHE.set;
  }
  try {
    const res = await fetch(JUP_VERIFIED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Jupiter HTTP ${res.status}`);
    // Endpoint returns an array; each item can be a string or object
    const arr = (await res.json()) as Array<any>;
    const mints = new Set<string>();
    for (const it of arr) {
      const mint =
        typeof it === "string"
          ? it
          : it?.id ||
            it?.mint ||
            it?.address ||
            it?.mintAddress ||
            it?.tokenMint;
      if (mint && typeof mint === "string") mints.add(mint.toLowerCase());
    }
    JUP_VERIFIED_CACHE = { set: mints, expiresAt: now + JUP_VERIFIED_TTL_MS };
    return mints;
  } catch {
    // fallback: stale cache or empty set (no filtering)
    return JUP_VERIFIED_CACHE?.set ?? new Set<string>();
  }
}

// True mint birth time (token_creation_info) with WSOL special-case + retry, no poison-cache
async function fetchCreationInfo(
  address: string,
  chain: string,
  apiKey: string,
  timeoutMs = 7000,
  maxRetries = 2
): Promise<number | undefined> {
  if (!address) return undefined;

  // Known special-case (e.g., WSOL)
  const known = KNOWN_CREATION_TIMES[address.toLowerCase()];
  if (typeof known === "number") {
    CREATION_CACHE.set(address, known);
    return known;
  }

  // Cache
  if (CREATION_CACHE.has(address)) {
    const v = CREATION_CACHE.get(address);
    return v === null ? undefined : v;
  }

  const url = `${BIRDEYE_CREATION}?address=${encodeURIComponent(address)}`;

  const tryOnce = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-chain": chain,
          "X-API-KEY": apiKey,
        },
        signal: ctrl.signal,
        cache: "no-store",
      });

      if (res.status === 404) {
        CREATION_CACHE.set(address, null); // permanent miss
        return undefined;
      }
      if (!res.ok) {
        // transient (429/5xx) — don't poison cache
        return undefined;
      }

      const json = (await res.json()) as any;
      const ts = json?.data?.blockUnixTime;
      const created = typeof ts === "number" ? ts : undefined;

      // sanity: after 2000-01-01 and in the past
      const nowSec = Math.floor(Date.now() / 1000);
      if (
        typeof created === "number" &&
        created > 946684800 &&
        created <= nowSec
      ) {
        CREATION_CACHE.set(address, created);
        return created;
      }
      return undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };

  let out = await tryOnce();
  let attempts = 0;
  while (out === undefined && attempts < maxRetries) {
    attempts++;
    await new Promise((r) => setTimeout(r, 250 * attempts)); // 250ms, then 500ms
    out = await tryOnce();
  }

  return out; // only cache successes above
}

// ------- Enrichment -------
async function enrichWithCreation(
  items: any[],
  chain: string,
  apiKey: string,
  concurrency = 6
) {
  const limiter = createLimiter(concurrency);
  const addresses = items
    .map((i) => i?.tokenAddress)
    .filter(Boolean) as string[];

  const times = await Promise.all(
    addresses.map((addr) =>
      limiter(() => fetchCreationInfo(addr, chain, apiKey))
    )
  );

  const byAddr = new Map<string, number | undefined>();
  addresses.forEach((addr, i) => byAddr.set(addr, times[i]));

  return items.map((it) => {
    const addr = it?.tokenAddress as string | undefined;
    if (!addr) return it;
    const createdFromCreationInfo = byAddr.get(addr);
    return {
      ...it,
      createdAt:
        typeof createdFromCreationInfo === "number"
          ? createdFromCreationInfo
          : undefined,
    };
  });
}

// ------- Defaults -------
const DEFAULTS = {
  chain: "solana",
  limit: 25,
  offset: 0, // filtered-offset
  sort_by: "v24hUSD",
  sort_type: "desc" as const,
  min_liquidity: 100,
  ui_amount_mode: "scaled" as const,
  include_creation: true,
  creation_concurrency: 6,
  verified_only: true,
};

// ------- POST -------
export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const chain = (body?.chain || DEFAULTS.chain) as string;
  const limit = toInt(body?.limit, DEFAULTS.limit, 1, 200);
  const offset = toInt(body?.offset, DEFAULTS.offset, 0);
  const sort_by = (body?.sort_by || DEFAULTS.sort_by) as string;
  const sort_type = (body?.sort_type || DEFAULTS.sort_type) as "asc" | "desc";
  const min_liquidity = toInt(body?.min_liquidity, DEFAULTS.min_liquidity, 0);
  const ui_amount_mode = (body?.ui_amount_mode || DEFAULTS.ui_amount_mode) as
    | "raw"
    | "scaled";
  const include_creation =
    typeof body?.include_creation === "boolean"
      ? body.include_creation
      : DEFAULTS.include_creation;
  const creation_concurrency = toInt(
    body?.creation_concurrency,
    DEFAULTS.creation_concurrency,
    1,
    16
  );
  const verified_only =
    typeof body?.verified_only === "boolean"
      ? body.verified_only
      : DEFAULTS.verified_only;

  // NEW: allow caller to force a full upstream scan to compute exact verified total
  const force_full_scan =
    typeof body?.force_full_scan === "boolean" ? body.force_full_scan : false;

  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing BIRDEYE_API_KEY" },
      { status: 500 }
    );
  }

  // We always fetch Jupiter's verified set once (cached), so we can:
  // - filter Birdeye pages when verified_only is true
  // - surface global jupVerifiedTotal regardless of verified_only
  const jupVerifiedSet = await getJupiterVerifiedSet();
  const verifiedSet = verified_only ? jupVerifiedSet : null;
  const jupVerifiedTotal = jupVerifiedSet.size;

  // If we need verified-only pagination, we must over-fetch until we can fill (offset + limit)
  // If we want the *exact* total of verified that also satisfy Birdeye filters, we must exhaust upstream
  const needPostFilterPagination = verified_only;
  const needVerifiedTotal = verified_only && force_full_scan;

  let upstreamTotal: number | undefined;
  const collected: any[] = [];

  // Walk Birdeye pages until we have enough FILTERED items to satisfy offset+limit,
  // or until exhausted (or keep going if force_full_scan is true).
  let birdeyeOffset = 0;
  const batchLimit = BIRDEYE_PAGE_MAX; // 50
  const maxBatches = needVerifiedTotal ? 9999 : 40; // safety valves
  let batches = 0;
  let exhausted = false;

  while (batches < maxBatches) {
    batches++;

    const listed = await fetchBirdeyeTokenlist({
      chain,
      limit: batchLimit,
      offset: birdeyeOffset,
      sort_by,
      sort_type,
      min_liquidity,
      ui_amount_mode,
      apiKey,
    });
    if (!listed.ok) {
      return NextResponse.json(
        { error: listed.error },
        { status: listed.status }
      );
    }

    upstreamTotal ??= listed.meta.total;

    const normalized = listed.tokens.map((t) =>
      normalizeTokenlistToken(t, chain)
    );

    // Apply verified filter here when requested
    const afterVerified =
      needPostFilterPagination && verifiedSet
        ? normalized.filter((n) =>
            verifiedSet.has((n?.tokenAddress || "").toLowerCase())
          )
        : normalized;

    // Accumulate and de-dupe on the fly
    for (const n of afterVerified) {
      const addr = (n?.tokenAddress || "").toLowerCase();
      if (!addr) continue;
      if (
        !collected.find((x) => (x?.tokenAddress || "").toLowerCase() === addr)
      ) {
        collected.push(n);
      }
    }

    // If we only need enough for this page (fast path), stop early
    if (!needVerifiedTotal && collected.length >= offset + limit) break;

    // If fewer than batchLimit tokens returned, upstream exhausted
    if (listed.tokens.length < batchLimit) {
      exhausted = true;
      break;
    }

    birdeyeOffset += listed.tokens.length;
  }

  // Slice the filtered collection for this page
  const pageItems = collected.slice(offset, offset + limit);

  // Optional: Creation enrichment on the page slice only
  const enriched = include_creation
    ? await enrichWithCreation(pageItems, chain, apiKey, creation_concurrency)
    : pageItems;

  const finalItems = dedupeByAddress(enriched);

  // Totals semantics:
  // - verifiedTotal: exact count of Birdeye + verified intersection if we exhausted upstream (or forced full scan).
  // - verifiedTotalLowerBound: when we didn't exhaust upstream, current collected length is a lower bound.
  const verifiedTotal = verified_only && exhausted ? collected.length : null;
  const verifiedTotalLowerBound =
    verified_only && !exhausted ? collected.length : null;

  const res = NextResponse.json(
    {
      items: finalItems,
      uniqueCount: finalItems.length,

      // pagination echo
      offset,
      limit,
      chain,

      // timing / meta echo (Birdeye page doesn't give per-page timestamps)
      updateUnixTime: undefined,
      updateTime: undefined,

      // request echo
      min_liquidity,
      sort_by,
      sort_type,
      ui_amount_mode,
      verified_only,
      force_full_scan,

      // totals
      upstreamTotal, // Birdeye's unfiltered total (for transparency)
      jupVerifiedTotal, // Global size of Jupiter's verified set
      verifiedTotal, // Exact only when we exhausted upstream
      verifiedTotalLowerBound, // Lower bound if we stopped early
      exhausted, // true if we reached end of upstream while collecting
    },
    { status: 200 }
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
