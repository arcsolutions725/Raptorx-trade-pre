// app/api/trending/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ------- Upstreams -------
const BIRDEYE_TOKENLIST = "https://public-api.birdeye.so/defi/tokenlist";
const BIRDEYE_CREATION =
  "https://public-api.birdeye.so/defi/token_creation_info";
const BIRDEYE_TOKEN_OVERVIEW =
  "https://public-api.birdeye.so/defi/token_overview";
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

// BNB verified tokens cache (Trust Wallet + PancakeSwap lists)
const BNB_VERIFIED_TTL_MS = 10 * 60 * 1000; // 10 min
let BNB_VERIFIED_CACHE: { set: Set<string>; expiresAt: number } | null = null;

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

function filterValidMarketCap(tokens: any[], chain: string): any[] {
  // For BNB and Base (EVM), filter out tokens with market cap of 0 or null/undefined
  if (chain === "bsc" || chain === "base") {
    return tokens.filter((token) => {
      const mc = token?.marketCap;
      return mc !== null && mc !== undefined && mc > 0;
    });
  }
  // For other chains, return tokens as-is
  return tokens;
}

function toInt(val: any, def: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(String(val), 10);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return def;
}

function dedupeByAddress(items: any[]) {
  if (!items.length) return items; // Early return for empty arrays

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
function normalizeBirdeyeTokenOverview(data: any, chain: string) {
  const address = data?.address ?? data?.mint ?? null;
  const price = typeof data?.price === "number" ? data.price : undefined;

  const marketCap =
    typeof data?.mc === "number"
      ? data.mc
      : typeof data?.marketCap === "number"
      ? data.marketCap
      : typeof data?.realMc === "number"
      ? data.realMc
      : undefined;

  const liquidityUsd =
    typeof data?.liquidity === "number" ? data.liquidity : undefined;

  const v24hUSD =
    typeof data?.v24hUSD === "number"
      ? data.v24hUSD
      : typeof data?.volume24hUSD === "number"
      ? data.volume24hUSD
      : undefined;

  const priceChange24h =
    typeof data?.priceChange24hPercent === "number"
      ? data.priceChange24hPercent
      : typeof data?.priceChange24h === "number"
      ? data.priceChange24h
      : undefined;

  const lastTradeUnixTime =
    typeof data?.lastTradeUnixTime === "number"
      ? data.lastTradeUnixTime
      : undefined;

  // Try to get creation time from various fields (Birdeye might include it in overview for some chains)
  const createdAt =
    typeof data?.createdAt === "number"
      ? data.createdAt
      : typeof data?.creationTime === "number"
      ? data.creationTime
      : typeof data?.creationTimestamp === "number"
      ? data.creationTimestamp
      : typeof data?.deployTime === "number"
      ? data.deployTime
      : undefined;

  return {
    chainId: chain,
    tokenAddress: address || undefined,
    name: data?.name ?? undefined,
    uniqueName: null,
    symbol: data?.symbol ?? undefined,
    decimals: typeof data?.decimals === "number" ? data.decimals : undefined,
    logo: data?.logoURI ?? data?.logo ?? undefined,

    usdPrice: price,
    marketCap,
    liquidityUsd,

    pricePercentChange: { "24h": priceChange24h },
    totalVolume: { "24h": v24hUSD },

    createdAt, // Try from overview first, then enriched via creation_info
    lastTradeUnixTime,

    rank: typeof data?.rank === "number" ? data.rank : undefined,
  } as any;
}

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

  // Try to get creation time from various fields
  const createdAt =
    typeof t?.createdAt === "number"
      ? t.createdAt
      : typeof t?.creationTime === "number"
      ? t.creationTime
      : typeof t?.creationTimestamp === "number"
      ? t.creationTimestamp
      : typeof t?.deployTime === "number"
      ? t.deployTime
      : undefined;

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

    createdAt, // Try from tokenlist, then enriched via creation_info
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

// ------- BNB Verified Tokens (Trust Wallet + PancakeSwap) -------
async function getBnbVerifiedSet(): Promise<Set<string>> {
  const now = Date.now();
  if (BNB_VERIFIED_CACHE && BNB_VERIFIED_CACHE.expiresAt > now) {
    return BNB_VERIFIED_CACHE.set;
  }

  try {
    const addresses = new Set<string>();

    // Fetch Trust Wallet's BNB token list
    const trustWalletUrl =
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/tokenlist.json";

    // Fetch PancakeSwap's default token list
    const pancakeSwapUrl =
      "https://tokens.pancakeswap.finance/pancakeswap-extended.json";

    const [trustRes, pancakeRes] = await Promise.allSettled([
      fetch(trustWalletUrl, { cache: "no-store" }),
      fetch(pancakeSwapUrl, { cache: "no-store" }),
    ]);

    // Parse Trust Wallet list
    if (trustRes.status === "fulfilled" && trustRes.value.ok) {
      try {
        const data = await trustRes.value.json();
        const tokens = data?.tokens || [];
        for (const token of tokens) {
          const addr = token?.address;
          if (addr && typeof addr === "string") {
            addresses.add(addr.toLowerCase());
          }
        }
      } catch (e) {
        console.warn("Failed to parse Trust Wallet BNB list:", e);
      }
    }

    // Parse PancakeSwap list
    if (pancakeRes.status === "fulfilled" && pancakeRes.value.ok) {
      try {
        const data = await pancakeRes.value.json();
        const tokens = data?.tokens || [];
        for (const token of tokens) {
          // Only BNB chain tokens (chainId 56)
          if (token?.chainId === 56) {
            const addr = token?.address;
            if (addr && typeof addr === "string") {
              addresses.add(addr.toLowerCase());
            }
          }
        }
      } catch (e) {
        console.warn("Failed to parse PancakeSwap BNB list:", e);
      }
    }

    BNB_VERIFIED_CACHE = {
      set: addresses,
      expiresAt: now + BNB_VERIFIED_TTL_MS,
    };
    return addresses;
  } catch (error) {
    console.error("Error fetching BNB verified lists:", error);
    // Fallback to stale cache or empty set
    return BNB_VERIFIED_CACHE?.set ?? new Set<string>();
  }
}

// ------- Jupiter search (by ticker / keyword) -------
async function fetchJupiterMintsByQuery(query: string): Promise<string[]> {
  const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(
    query
  )}`;

  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) throw new Error(`Jupiter HTTP ${res.status}`);
    const arr = (await res.json()) as Array<any>;

    // pick possible mint fields; Jupiter returns "id" as mint most of the time
    const mints = new Set<string>();
    for (const it of arr) {
      const mint =
        it?.id ||
        it?.mint ||
        it?.address ||
        it?.mintAddress ||
        it?.tokenMint ||
        null;
      if (mint && typeof mint === "string") {
        mints.add(mint);
      }
    }
    return Array.from(mints);
  } catch (e) {
    console.warn("Jupiter search error:", e);
    return [];
  }
}

// ------- Batch Birdeye Overview fetch for mints -------
async function fetchOverviewsForMints(opts: {
  mints: string[];
  chain: string;
  apiKey: string;
  concurrency?: number;
}): Promise<any[]> {
  const { mints, chain, apiKey, concurrency = 8 } = opts;
  const limiter = createLimiter(concurrency);
  const out = await Promise.all(
    mints.map((mint) =>
      limiter(() => fetchBirdeyeTokenOverview(mint, chain, apiKey))
    )
  );
  // filter nulls
  return out.filter(Boolean);
}

// True mint birth time (token_creation_info) for SOLANA ONLY
async function fetchCreationInfo(
  address: string,
  chain: string,
  apiKey: string,
  timeoutMs = 7000,
  maxRetries = 2
): Promise<number | undefined> {
  if (!address) return undefined;

  // For BSC/BNB chain, fall back to Birdeye creation API like other chains

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

// ------- Enrichment (optimized) -------
async function enrichWithCreation(
  items: any[],
  chain: string,
  apiKey: string,
  concurrency = 6
) {
  // Early return if no items
  if (!items.length) return items;

  const limiter = createLimiter(concurrency);

  // Filter and dedupe addresses in one pass
  const addressSet = new Set<string>();
  const validItems = items.filter((item) => {
    const addr = item?.tokenAddress;
    if (!addr || addressSet.has(addr)) return false;
    addressSet.add(addr);
    return true;
  });

  if (!validItems.length) return items;

  const addresses = Array.from(addressSet);
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
      // Prefer creation_info, but keep existing createdAt if creation_info fails
      createdAt:
        typeof createdFromCreationInfo === "number"
          ? createdFromCreationInfo
          : it?.createdAt ?? undefined,
    };
  });
}

// ------- Birdeye Token Overview Fetcher -------
async function fetchBirdeyeTokenOverview(
  address: string,
  chain: string,
  apiKey: string
): Promise<any | null> {
  if (!address) return null;

  const url = `${BIRDEYE_TOKEN_OVERVIEW}?address=${encodeURIComponent(
    address
  )}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-chain": chain,
        "X-API-KEY": apiKey,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`Birdeye token overview failed: ${res.status}`);
      return null;
    }

    const json = await res.json();

    if (!json?.success || !json?.data) {
      console.warn("Birdeye token overview: no data");
      return null;
    }

    return json.data;
  } catch (error) {
    console.warn("Birdeye token overview error:", error);
    return null;
  }
}

// ------- Search by ticker in Birdeye tokenlist (optimized) -------
// Note: This function is kept for potential future use but currently replaced by Jupiter search + Birdeye overview approach
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchTokenByTicker(
  ticker: string,
  chain: string,
  apiKey: string,
  maxPages = 20 // Reduced from 4000 for performance
): Promise<any[]> {
  const searchTicker = ticker.toLowerCase();
  const results: any[] = [];
  let offset = 0;
  const pageSize = BIRDEYE_PAGE_MAX; // 50
  const maxResults = 100; // Cap total results for performance

  for (let page = 0; page < maxPages && results.length < maxResults; page++) {
    const listed = await fetchBirdeyeTokenlist({
      chain,
      limit: pageSize,
      offset,
      sort_by: "v24hUSD",
      sort_type: "desc",
      min_liquidity: 100,
      ui_amount_mode: "scaled",
      apiKey,
    });

    if (!listed.ok || !listed.tokens.length) {
      break;
    }

    // Filter tokens that match the ticker (optimized with early break)
    for (const token of listed.tokens) {
      if (results.length >= maxResults) break;
      const symbol = (token?.symbol || "").toLowerCase();
      if (symbol === searchTicker) {
        results.push(token);
      }
    }

    // Early termination: if we found matches and they're becoming sparse, stop
    if (results.length > 0 && page > 2) {
      break;
    }

    // If we got fewer tokens than page size, we've reached the end
    if (listed.tokens.length < pageSize) {
      break;
    }

    offset += listed.tokens.length;
  }

  return results;
}

// ------- Search Handler -------
async function handleTokenSearch(opts: {
  search_query: string;
  search_type: "ticker" | "address";
  chain: string;
  apiKey: string;
  limit: number;
  include_creation: boolean;
  creation_concurrency: number;
}): Promise<NextResponse> {
  const {
    search_query,
    search_type,
    chain,
    apiKey,
    limit,
    include_creation,
    creation_concurrency,
  } = opts;

  try {
    let searchResults: any[] = [];

    if (search_type === "address") {
      // If chain is "all", detect based on address pattern (0x... => bsc; could be base too, default bsc for now)
      const targetChain =
        chain === "all"
          ? /^0x[a-fA-F0-9]{40}$/.test(search_query.trim())
            ? "bsc"
            : "solana"
          : chain;

      // Direct address lookup using Birdeye token overview on the resolved chain
      const tokenData = await fetchBirdeyeTokenOverview(
        search_query,
        targetChain,
        apiKey
      );

      if (!tokenData) {
        return NextResponse.json({
          items: [],
          uniqueCount: 0,
          offset: 0,
          limit,
          chain: targetChain,
          upstreamTotal: 0,
          exhausted: true,
          searchQuery: search_query,
          searchType: search_type,
          searchResults: true,
          message: `No token found for address: ${search_query}`,
        });
      }

      // Convert Birdeye token overview to trending token format
      const searchResult = normalizeBirdeyeTokenOverview(tokenData, targetChain);
      searchResults = [searchResult];
    } else if (search_type === "ticker") {
      if (chain === "bsc") {
        // BNB chain: resolve by scanning Birdeye tokenlist for exact symbol matches
        const listed = await searchTokenByTicker(search_query, chain, apiKey, 10);
        const normalized = listed.map((t) => normalizeTokenlistToken(t, chain));
        const filtered = filterValidMarketCap(normalized, chain);
        searchResults = dedupeByAddress(filtered).slice(0, limit);
      } else if (chain === "base") {
        // Base chain: Birdeye tokenlist search
        const listed = await searchTokenByTicker(search_query, chain, apiKey, 10);
        const normalized = listed.map((t) => normalizeTokenlistToken(t, chain));
        const filtered = filterValidMarketCap(normalized, chain);
        searchResults = dedupeByAddress(filtered).slice(0, limit);
      } else if (chain === "all") {
        // ALL chains: fetch Solana, BNB, Base in parallel and merge
        const [solResults, bnbListed, baseListed] = await Promise.all([
          (async () => {
            const jupMints = await fetchJupiterMintsByQuery(search_query);
            if (jupMints.length === 0) return [] as any[];

            const jupResultsRaw = await (async () => {
              const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(
                search_query
              )}`;
              try {
                const r = await fetch(url, { cache: "no-store" });
                if (!r.ok) return [];
                return (await r.json()) as Array<any>;
              } catch {
                return [];
              }
            })();

            const target = search_query.toLowerCase();
            const exactMintOrder: string[] = [];
            const fuzzyMintOrder: string[] = [];
            const seen = new Set<string>();
            for (const it of jupResultsRaw) {
              const mint =
                it?.id ||
                it?.mint ||
                it?.address ||
                it?.mintAddress ||
                it?.tokenMint ||
                null;
              if (!mint || seen.has(mint)) continue;
              seen.add(mint);
              const sym = String(it?.symbol ?? "").toLowerCase();
              const name = String(it?.name ?? "").toLowerCase();
              if (sym === target) exactMintOrder.push(mint);
              else if (sym.includes(target) || name.includes(target))
                fuzzyMintOrder.push(mint);
            }
            const leftovers = jupMints.filter(
              (m) => !exactMintOrder.includes(m) && !fuzzyMintOrder.includes(m)
            );
            const orderedMints = [
              ...exactMintOrder,
              ...fuzzyMintOrder,
              ...leftovers,
            ];
            const overviews = await fetchOverviewsForMints({
              mints: orderedMints.slice(0, Math.max(limit * 3, 30)),
              chain: "solana",
              apiKey,
              concurrency: 8,
            });
            const normalized = overviews.map((d) =>
              normalizeBirdeyeTokenOverview(d, "solana")
            );
            const byAddr = new Map<string, any>();
            for (const n of normalized) {
              const addr = (n?.tokenAddress || "").toLowerCase();
              if (addr && !byAddr.has(addr)) byAddr.set(addr, n);
            }
            const ordered = orderedMints
              .map((m) => byAddr.get(m.toLowerCase()))
              .filter(Boolean) as any[];
            return ordered;
          })(),
          (async () => {
            const listed = await searchTokenByTicker(
              search_query,
              "bsc",
              apiKey,
              10
            );
            const normalized = listed.map((t) =>
              normalizeTokenlistToken(t, "bsc")
            );
            const filtered = filterValidMarketCap(normalized, "bsc");
            return dedupeByAddress(filtered);
          })(),
          (async () => {
            const listed = await searchTokenByTicker(
              search_query,
              "base",
              apiKey,
              10
            );
            const normalized = listed.map((t) =>
              normalizeTokenlistToken(t, "base")
            );
            const filtered = filterValidMarketCap(normalized, "base");
            return dedupeByAddress(filtered);
          })(),
        ]);

        const combined = [...baseListed, ...bnbListed, ...solResults];
        searchResults = combined.slice(0, Math.max(limit, 25));
      } else {
        // Solana and others: use Jupiter search + Birdeye overview
        const jupMints = await fetchJupiterMintsByQuery(search_query);

        if (jupMints.length === 0) {
          return NextResponse.json({
            items: [],
            uniqueCount: 0,
            offset: 0,
            limit,
            chain,
            upstreamTotal: 0,
            exhausted: true,
            searchQuery: search_query,
            searchType: search_type,
            searchResults: true,
            message: `No tokens found from Jupiter search for: ${search_query}`,
          });
        }

        const jupResultsRaw = await (async () => {
          const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(
            search_query
          )}`;
          try {
            const r = await fetch(url, { cache: "no-store" });
            if (!r.ok) return [];
            return (await r.json()) as Array<any>;
          } catch {
            return [];
          }
        })();

        const target = search_query.toLowerCase();
        const exactMintOrder: string[] = [];
        const fuzzyMintOrder: string[] = [];
        const seen = new Set<string>();
        for (const it of jupResultsRaw) {
          const mint =
            it?.id ||
            it?.mint ||
            it?.address ||
            it?.mintAddress ||
            it?.tokenMint ||
            null;
          if (!mint || seen.has(mint)) continue;
          seen.add(mint);

          const sym = String(it?.symbol ?? "").toLowerCase();
          const name = String(it?.name ?? "").toLowerCase();

          if (sym === target) exactMintOrder.push(mint);
          else if (sym.includes(target) || name.includes(target))
            fuzzyMintOrder.push(mint);
        }

        const leftovers = jupMints.filter(
          (m) => !exactMintOrder.includes(m) && !fuzzyMintOrder.includes(m)
        );
        const orderedMints = [...exactMintOrder, ...fuzzyMintOrder, ...leftovers];

        const overviews = await fetchOverviewsForMints({
          mints: orderedMints.slice(0, Math.max(limit * 3, 30)),
          chain,
          apiKey,
          concurrency: 8,
        });

        if (overviews.length === 0) {
          return NextResponse.json({
            items: [],
            uniqueCount: 0,
            offset: 0,
            limit,
            chain,
            upstreamTotal: 0,
            exhausted: true,
            searchQuery: search_query,
            searchType: search_type,
            searchResults: true,
            message: `No Birdeye overviews for Jupiter results: ${search_query}`,
          });
        }

        const normalized = overviews.map((d) =>
          normalizeBirdeyeTokenOverview(d, chain)
        );
        const byAddr = new Map<string, any>();
        for (const n of normalized) {
          const addr = (n?.tokenAddress || "").toLowerCase();
          if (addr && !byAddr.has(addr)) byAddr.set(addr, n);
        }
        const ordered = orderedMints
          .map((m) => byAddr.get(m.toLowerCase()))
          .filter(Boolean) as any[];
        searchResults = ordered.slice(0, limit);
      }
    }

    // Apply sorting by market cap (higher first) then liquidity (higher first)
    const sortedResults = searchResults.sort((a, b) => {
      // Primary sort: Market cap (higher first)
      const aMarketCap = a.marketCap ?? 0;
      const bMarketCap = b.marketCap ?? 0;

      if (aMarketCap !== bMarketCap) {
        return bMarketCap - aMarketCap; // Higher market cap first
      }

      // Secondary sort: Liquidity (higher first)
      const aLiquidity = a.liquidityUsd ?? 0;
      const bLiquidity = b.liquidityUsd ?? 0;

      return bLiquidity - aLiquidity; // Higher liquidity first
    });

    // Optionally enrich with creation time
    const enrichedResults = include_creation
      ? await enrichWithCreation(
          sortedResults,
          chain,
          apiKey,
          creation_concurrency
        )
      : sortedResults;

    return NextResponse.json({
      items: enrichedResults,
      uniqueCount: enrichedResults.length,
      offset: 0,
      limit,
      chain,
      upstreamTotal: enrichedResults.length,
      exhausted: true,
      searchQuery: search_query,
      searchType: search_type,
      searchResults: true,
    });
  } catch (error) {
    console.error("Token search error:", error);
    return NextResponse.json(
      {
        error: "Search failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ------- Mixed Chain Handler (Solana + BNB + Base) -------
async function handleMixedChainTokens(opts: {
  limit: number;
  offset: number;
  sort_by: string;
  sort_type: "asc" | "desc";
  min_liquidity: number;
  ui_amount_mode: "raw" | "scaled";
  include_creation: boolean;
  creation_concurrency: number;
  verified_only: boolean;
  apiKey: string;
}): Promise<NextResponse> {
  const {
    limit,
    offset,
    sort_by,
    sort_type,
    min_liquidity,
    ui_amount_mode,
    include_creation,
    creation_concurrency,
    verified_only,
    apiKey,
  } = opts;

  // Proportional split across three chains
  const perChain = Math.ceil(limit / 3);
  const solanaLimit = perChain;
  const bnbLimit = perChain;
  const baseLimit = perChain;
  const solanaOffset = Math.floor(offset / 3);
  const bnbOffset = Math.floor(offset / 3);
  const baseOffset = Math.floor(offset / 3);

  // Fetch all three chains in parallel
  const [solanaTokens, bnbTokens, baseTokens] = await Promise.all([
    fetchChainTokens({
      chain: "solana",
      limit: solanaLimit,
      offset: solanaOffset,
      sort_by,
      sort_type,
      min_liquidity,
      ui_amount_mode,
      include_creation,
      creation_concurrency,
      verified_only,
      apiKey,
    }),
    fetchChainTokens({
      chain: "bsc",
      limit: bnbLimit,
      offset: bnbOffset,
      sort_by,
      sort_type,
      min_liquidity,
      ui_amount_mode,
      include_creation,
      creation_concurrency,
      verified_only,
      apiKey,
    }),
    fetchChainTokens({
      chain: "base",
      limit: baseLimit,
      offset: baseOffset,
      sort_by,
      sort_type,
      min_liquidity,
      ui_amount_mode,
      include_creation,
      creation_concurrency,
      verified_only,
      apiKey,
    }),
  ]);

  // Interleave: round-robin solana, bnb, base
  const mixed: any[] = [];
  const maxLength = Math.max(
    solanaTokens.length,
    bnbTokens.length,
    baseTokens.length
  );
  for (let i = 0; i < maxLength; i++) {
    if (i < baseTokens.length) mixed.push(baseTokens[i]);
    if (i < bnbTokens.length) mixed.push(bnbTokens[i]);
    if (i < solanaTokens.length) mixed.push(solanaTokens[i]);
  }

  return NextResponse.json(
    {
      items: mixed.slice(0, limit),
      uniqueCount: mixed.length,
      offset,
      limit,
      chain: "all",
      chainDistribution: {
        solana: solanaTokens.length,
        bnb: bnbTokens.length,
        base: baseTokens.length,
      },
      upstreamTotal: undefined,
      exhausted: false,
    },
    { status: 200 }
  );
}

// Helper to fetch tokens for a single chain
async function fetchChainTokens(opts: {
  chain: string;
  limit: number;
  offset: number;
  sort_by: string;
  sort_type: "asc" | "desc";
  min_liquidity: number;
  ui_amount_mode: "raw" | "scaled";
  include_creation: boolean;
  creation_concurrency: number;
  verified_only: boolean;
  apiKey: string;
}): Promise<any[]> {
  const {
    chain,
    limit,
    offset,
    sort_by,
    sort_type,
    min_liquidity,
    ui_amount_mode,
    include_creation,
    creation_concurrency,
    verified_only,
    apiKey,
  } = opts;

  try {
    // Get verified set based on chain (Base has no verified list; treat like unverified)
    let verifiedSet: Set<string> | null = null;
    if (verified_only) {
      if (chain === "solana") {
        verifiedSet = await getJupiterVerifiedSet();
      } else if (chain === "bsc") {
        verifiedSet = await getBnbVerifiedSet();
      }
      // base: no verified list, verifiedSet stays null so we return all
    }

    const collected: any[] = [];
    let birdeyeOffset = offset;
    const batchLimit = Math.min(BIRDEYE_PAGE_MAX, limit * 2);
    const maxBatches = 5;
    let batches = 0;

    while (batches < maxBatches && collected.length < limit) {
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

      if (!listed.ok || !listed.tokens.length) break;

      const normalized = listed.tokens.map((t) =>
        normalizeTokenlistToken(t, chain)
      );

      // Apply verified filter based on chain
      const filtered = verifiedSet
        ? normalized.filter((n) =>
            verifiedSet.has((n?.tokenAddress || "").toLowerCase())
          )
        : normalized;

      // Apply market cap filter for BNB tokens (remove tokens with mc = 0 or null)
      const marketCapFiltered = filterValidMarketCap(filtered, chain);

      collected.push(...marketCapFiltered);

      if (listed.tokens.length < batchLimit) break;
      birdeyeOffset += listed.tokens.length;
    }

    // Enrich with creation info
    const pageItems = collected.slice(0, limit);
    const enriched = include_creation
      ? await enrichWithCreation(pageItems, chain, apiKey, creation_concurrency)
      : pageItems;

    return dedupeByAddress(enriched);
  } catch (error) {
    console.error(`Error fetching ${chain} tokens:`, error);
    return [];
  }
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
  verified_only: false,
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

  // NEW: Search parameters
  const search_query = body?.search_query as string | undefined;
  const search_type = body?.search_type as "ticker" | "address" | undefined;

  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing BIRDEYE_API_KEY" },
      { status: 500 }
    );
  }

  // Handle search functionality
  if (search_query && search_type) {
    return await handleTokenSearch({
      search_query: search_query.trim(),
      search_type,
      chain,
      apiKey,
      limit,
      include_creation,
      creation_concurrency,
    });
  }

  // NEW: Handle "all" chain - fetch both Solana and BNB and mix them
  if (chain === "all") {
    return await handleMixedChainTokens({
      limit,
      offset,
      sort_by,
      sort_type,
      min_liquidity,
      ui_amount_mode,
      include_creation,
      creation_concurrency,
      verified_only,
      apiKey,
    });
  }

  // Get verified set based on chain
  let verifiedSet: Set<string> | null = null;
  let verifiedTotal: number | undefined;

  if (chain === "solana") {
    const jupVerifiedSet = await getJupiterVerifiedSet();
    verifiedSet = verified_only ? jupVerifiedSet : null;
    verifiedTotal = jupVerifiedSet.size;
  } else if (chain === "bsc") {
    const bnbVerifiedSet = await getBnbVerifiedSet();
    verifiedSet = verified_only ? bnbVerifiedSet : null;
    verifiedTotal = bnbVerifiedSet.size;
  } else if (chain === "base") {
    // Base: no verified list; show all tokens
    verifiedSet = null;
    verifiedTotal = undefined;
  }

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

    // Apply market cap filter for BNB tokens (remove tokens with mc = 0 or null)
    const afterMarketCapFilter = filterValidMarketCap(afterVerified, chain);

    // Optimized de-duplication using Set for O(1) lookups
    const seenAddresses = new Set(
      collected.map((x) => (x?.tokenAddress || "").toLowerCase())
    );
    for (const n of afterMarketCapFilter) {
      const addr = (n?.tokenAddress || "").toLowerCase();
      if (!addr || seenAddresses.has(addr)) continue;
      seenAddresses.add(addr);
      collected.push(n);
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
  // - verifiedTotalFiltered: exact count of Birdeye + verified intersection if we exhausted upstream (or forced full scan).
  // - verifiedTotalLowerBound: when we didn't exhaust upstream, current collected length is a lower bound.
  const verifiedTotalFiltered =
    verified_only && exhausted ? collected.length : null;
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
      verifiedTotal, // Global size of verified set (Jupiter for Solana, Trust Wallet + PancakeSwap for BNB)
      verifiedTotalFiltered, // Exact count when exhausted upstream
      verifiedTotalLowerBound, // Lower bound if we stopped early
      exhausted, // true if we reached end of upstream while collecting
    },
    { status: 200 }
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
