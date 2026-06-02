// app/api/trending/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { enrichWithCreation } from "@/lib/birdeyeTokenCreationInfo";

export const dynamic = "force-dynamic";

// ------- Upstreams -------
/** Uniblock Direct API (Birdeye provider) for token list + token data used by screener table. */
const UNIBLOCK_BIRDEYE_BASE = "https://api.uniblock.dev/direct/v1/Birdeye";
/** Token list: V3 (Base / EVM + Solana). */
const BIRDEYE_TOKENLIST_V3 = `${UNIBLOCK_BIRDEYE_BASE}/defi/v3/token/list`;
const BIRDEYE_V3_SEARCH = `${UNIBLOCK_BIRDEYE_BASE}/defi/v3/search`;
const BIRDEYE_TOKEN_OVERVIEW = `${UNIBLOCK_BIRDEYE_BASE}/defi/token_overview`;
/** Jupiter Tokens V2 — full verified catalog (one response; avoids Birdeye list rate limits). */
const JUP_TAG_VERIFIED_PRIMARY =
  "https://api.jup.ag/tokens/v2/tag?query=verified";
const JUP_TAG_VERIFIED_LITE =
  "https://lite-api.jup.ag/tokens/v2/tag?query=verified";

// Birdeye token list V3: https://docs.birdeye.so/reference/get-defi-v3-token-list
const BIRDEYE_V3_LIST_MAX = 100; // limit 1..100
const BIRDEYE_V3_OFFSET_LIMIT_MAX_SUM = 10000; // offset + limit <= 10000

/** Legacy V1 sort_by → V3 sort_by */
const BIRDEYE_V3_SORT_LEGACY: Record<string, string> = {
  mc: "market_cap",
  v24hUSD: "volume_24h_usd",
  v24hChangePercent: "volume_24h_change_percent",
  liquidity: "liquidity",
};

const BIRDEYE_V3_SORT_ALLOWED = new Set([
  "liquidity",
  "market_cap",
  "fdv",
  "recent_listing_time",
  "last_trade_unix_time",
  "holder",
  "volume_1m_usd",
  "volume_5m_usd",
  "volume_30m_usd",
  "volume_1h_usd",
  "volume_2h_usd",
  "volume_4h_usd",
  "volume_8h_usd",
  "volume_24h_usd",
  "volume_7d_usd",
  "volume_30d_usd",
  "volume_1m_change_percent",
  "volume_5m_change_percent",
  "volume_30m_change_percent",
  "volume_1h_change_percent",
  "volume_2h_change_percent",
  "volume_4h_change_percent",
  "volume_8h_change_percent",
  "volume_24h_change_percent",
  "volume_7d_change_percent",
  "volume_30d_change_percent",
  "price_change_1m_percent",
  "price_change_5m_percent",
  "price_change_30m_percent",
  "price_change_1h_percent",
  "price_change_2h_percent",
  "price_change_4h_percent",
  "price_change_8h_percent",
  "price_change_24h_percent",
  "price_change_7d_percent",
  "price_change_30d_percent",
  "trade_1m_count",
  "trade_5m_count",
  "trade_30m_count",
  "trade_1h_count",
  "trade_2h_count",
  "trade_4h_count",
  "trade_8h_count",
  "trade_24h_count",
  "trade_7d_count",
  "trade_30d_count",
]);

function birdeyeV3SortBy(fromClient: string): string {
  if (BIRDEYE_V3_SORT_LEGACY[fromClient]) {
    return BIRDEYE_V3_SORT_LEGACY[fromClient];
  }
  if (BIRDEYE_V3_SORT_ALLOWED.has(fromClient)) return fromClient;
  return "volume_24h_usd";
}

function clampBirdeyeV3OffsetLimit(
  offset: number,
  limit: number
): { offset: number; limit: number } {
  const o = Math.max(
    0,
    Math.min(Math.floor(offset), BIRDEYE_V3_OFFSET_LIMIT_MAX_SUM - 1)
  );
  const maxLimit = Math.max(1, BIRDEYE_V3_OFFSET_LIMIT_MAX_SUM - o);
  const l = Math.min(
    Math.max(1, Math.floor(limit)),
    BIRDEYE_V3_LIST_MAX,
    maxLimit
  );
  return { offset: o, limit: l };
}

// ------- Types -------
type ListOk = {
  ok: true;
  tokens: any[];
  meta: {
    /** V3 often omits global total; use hasNext + offset for pagination */
    total: number | undefined;
    updateUnixTime: number | null;
    updateTime: string | null;
    hasNext?: boolean;
    /** Actual limit sent to Birdeye (after offset+limit clamp) */
    pageLimit: number;
  };
};
type ListErr = { ok: false; error: string; status: number };
type ListResult = ListOk | ListErr;

// ------- Caches -------
/** Cache normalized Jupiter verified rows (shared by set + Solana verified table). */
const JUP_VERIFIED_CATALOG_TTL_MS = 2 * 60 * 1000; // 2 min — large payload; lowers repeat traffic
let jupiterVerifiedCatalogCache: { rows: any[]; expiresAt: number } | null =
  null;

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

function coerceFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Drop absurd FDV/manipulation rows (huge mcap vs negligible liquidity). */
function passesSearchLiquiditySanity(t: any): boolean {
  const mc = coerceFiniteNumber(t?.marketCap) ?? 0;
  const liq = coerceFiniteNumber(t?.liquidityUsd) ?? 0;
  if (!(mc > 0)) return true;
  if (mc >= 1e12 && liq < 5000) return false;
  if (
    mc >= 1e9 &&
    liq >= 0 &&
    liq < 200 &&
    mc / Math.max(liq, 1e-12) > 5e7
  ) {
    return false;
  }
  if (mc > 5e7 && liq > 0 && liq < 40) return false;
  return true;
}

function shouldKeepTickerSearchRow(row: any, chainFetch: string): boolean {
  const chain = String(chainFetch || "solana").toLowerCase();
  if (chain === "solana") {
    // Solana search must only return Birdeye-verified rows.
    return row?.verified === true;
  }
  if (chain === "all") {
    // When searching all chains, enforce verified only for Solana rows.
    const rowChain = String(row?.chainId ?? "").toLowerCase();
    if (rowChain === "solana") return row?.verified === true;
  }
  // EVM chains: do not apply external trust/scam lists in ticker search.
  return true;
}

function applyTickerSearchResultFilter(rows: any[], chainFetch: string): any[] {
  if (!rows.length) return [];
  const sane = rows.filter(passesSearchLiquiditySanity);
  if (!sane.length) return [];
  return sane.filter((row) => shouldKeepTickerSearchRow(row, chainFetch));
}

function filterValidMarketCap(tokens: any[], chain: string): any[] {
  if (
    chain === "bsc" ||
    chain === "base" ||
    chain === "monad" ||
    chain === "ethereum"
  ) {
    return tokens.filter((token) => {
      const mc = coerceFiniteNumber(token?.marketCap);
      if (mc !== undefined && mc > 0) return true;
      if (chain === "bsc") return false;
      const liq = coerceFiniteNumber(token?.liquidityUsd);
      if (liq !== undefined && liq > 0) return true;
      const vol = coerceFiniteNumber(token?.totalVolume?.["24h"]);
      return vol !== undefined && vol > 0;
    });
  }
  return tokens;
}

function toInt(val: any, def: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(String(val), 10);
  if (Number.isFinite(n)) return Math.min(max, Math.max(min, n));
  return def;
}

/** Solana mints are base58 and case-sensitive; lowercasing breaks Birdeye (400). EVM = lowercase. */
function tokenAddressLookupKey(chain: string, address: string): string {
  const a = String(address || "").trim();
  if (!a) return "";
  return chain === "solana" ? a : a.toLowerCase();
}

/** Param value for Birdeye `address` query (preserve valid Solana casing). */
function birdeyeTokenAddressParam(chain: string, address: string): string {
  const a = String(address || "").trim();
  if (!a) return a;
  return chain === "solana" ? a : a.toLowerCase();
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
  const price = coerceFiniteNumber(data?.price);

  const marketCap =
    coerceFiniteNumber(data?.mc) ??
    coerceFiniteNumber(data?.market_cap) ??
    coerceFiniteNumber(data?.marketCap) ??
    coerceFiniteNumber(data?.realMc);

  const liquidityUsd = coerceFiniteNumber(data?.liquidity);

  const v24hUSD =
    coerceFiniteNumber(data?.v24hUSD) ??
    coerceFiniteNumber(data?.volume24hUSD) ??
    coerceFiniteNumber(data?.volume_24h_usd);

  const priceChange24h =
    coerceFiniteNumber(data?.price_change_24h_percent) ??
    coerceFiniteNumber(data?.priceChange24hPercent) ??
    coerceFiniteNumber(data?.priceChange24h);

  const volumeChange24h =
    coerceFiniteNumber(data?.volume_24h_change_percent) ??
    coerceFiniteNumber(data?.v24hChangePercent);

  const lastTradeUnixTime = coerceFiniteNumber(data?.lastTradeUnixTime);

  const createdAt =
    coerceFiniteNumber(data?.createdAt) ??
    coerceFiniteNumber(data?.creationTime) ??
    coerceFiniteNumber(data?.creationTimestamp) ??
    coerceFiniteNumber(data?.deployTime);

  const decimalsRawOv = coerceFiniteNumber(data?.decimals);
  const decimalsOv =
    decimalsRawOv !== undefined ? Math.trunc(decimalsRawOv) : undefined;

  return {
    chainId: chain,
    tokenAddress: address || undefined,
    name: data?.name ?? undefined,
    uniqueName: null,
    symbol: data?.symbol ?? undefined,
    decimals: decimalsOv,
    logo: data?.logoURI ?? data?.logo ?? undefined,

    usdPrice: price,
    marketCap,
    liquidityUsd,

    pricePercentChange: { "24h": priceChange24h },
    volumePercentChange: { "24h": volumeChange24h },
    totalVolume: { "24h": v24hUSD },

    createdAt, // Try from overview first, then enriched via creation_info
    lastTradeUnixTime,

    rank: coerceFiniteNumber(data?.rank),
  } as any;
}

function normalizeTokenlistToken(t: any, chain: string) {
  const address = t?.address ?? t?.mint ?? null;
  const price = coerceFiniteNumber(t?.price);

  const marketCap =
    coerceFiniteNumber(t?.mc) ??
    coerceFiniteNumber(t?.market_cap) ??
    coerceFiniteNumber(t?.marketcap) ??
    coerceFiniteNumber(t?.fdv);

  const liquidityUsd = coerceFiniteNumber(t?.liquidity);

  const v24hUSD =
    coerceFiniteNumber(t?.v24hUSD) ??
    coerceFiniteNumber(t?.volume24hUSD) ??
    coerceFiniteNumber(t?.volume_24h_usd);

  const priceChange24h =
    coerceFiniteNumber(t?.price_change_24h_percent) ??
    coerceFiniteNumber(t?.price24hChangePercent) ??
    coerceFiniteNumber(t?.priceChange24hPercent) ??
    coerceFiniteNumber(t?.priceChange24h);

  const volumeChange24h =
    coerceFiniteNumber(t?.volume_24h_change_percent) ??
    coerceFiniteNumber(t?.v24hChangePercent);

  const lastTradeUnixTime =
    coerceFiniteNumber(t?.lastTradeUnixTime) ??
    coerceFiniteNumber(t?.last_trade_unix_time);

  const createdAt =
    coerceFiniteNumber(t?.createdAt) ??
    coerceFiniteNumber(t?.creationTime) ??
    coerceFiniteNumber(t?.creationTimestamp) ??
    coerceFiniteNumber(t?.deployTime) ??
    coerceFiniteNumber(t?.recent_listing_time);

  const decimalsRaw = coerceFiniteNumber(t?.decimals);
  const decimals =
    decimalsRaw !== undefined ? Math.trunc(decimalsRaw) : undefined;

  const verified =
    typeof t?.verified === "boolean"
      ? t.verified
      : typeof t?.is_verified === "boolean"
        ? t.is_verified
        : undefined;

  return {
    chainId: chain,
    tokenAddress: address || undefined,
    name: t?.name ?? undefined,
    uniqueName: null,
    symbol: t?.symbol ?? t?.symbols ?? undefined,
    decimals,
    logo: t?.logoURI ?? t?.logo_uri ?? undefined,

    usdPrice: price,
    marketCap,
    liquidityUsd,

    pricePercentChange: { "24h": priceChange24h },
    volumePercentChange: { "24h": volumeChange24h },
    totalVolume: { "24h": v24hUSD },

    createdAt,
    lastTradeUnixTime,

    rank: coerceFiniteNumber(t?.rank),
    verified,
  } as any;
}

function volumeFromJupiterStats(stats: any): number | undefined {
  if (!stats || typeof stats !== "object") return undefined;
  const b = coerceFiniteNumber(stats.buyVolume);
  const s = coerceFiniteNumber(stats.sellVolume);
  const sum = (b ?? 0) + (s ?? 0);
  return sum > 0 ? sum : undefined;
}

/** Map Jupiter Tokens V2 tag row → same shape as Birdeye token list rows for downstream enrich/sort. */
function normalizeJupiterVerifiedToken(j: any): any | null {
  const id = j?.id;
  if (!id || typeof id !== "string") return null;

  const s5 = j?.stats5m;
  const s1h = j?.stats1h;
  const s6h = j?.stats6h;
  const s24 = j?.stats24h;

  let createdAt: number | undefined;
  const fp = j?.firstPool?.createdAt;
  if (typeof fp === "string") {
    const ms = Date.parse(fp);
    if (Number.isFinite(ms)) createdAt = Math.floor(ms / 1000);
  }

  let lastTradeUnixTime: number | undefined;
  if (typeof j?.updatedAt === "string") {
    const ms = Date.parse(j.updatedAt);
    if (Number.isFinite(ms)) lastTradeUnixTime = Math.floor(ms / 1000);
  }

  const mcap = coerceFiniteNumber(j?.mcap);
  const fdv = coerceFiniteNumber(j?.fdv);

  return {
    chainId: "solana",
    tokenAddress: id,
    name: j?.name,
    symbol: j?.symbol,
    decimals:
      typeof j?.decimals === "number" && Number.isFinite(j.decimals)
        ? Math.trunc(j.decimals)
        : undefined,
    logo: j?.icon,
    usdPrice: coerceFiniteNumber(j?.usdPrice),
    marketCap: mcap ?? fdv,
    fdv,
    liquidityUsd: coerceFiniteNumber(j?.liquidity),
    holders:
      typeof j?.holderCount === "number" && Number.isFinite(j.holderCount)
        ? Math.trunc(j.holderCount)
        : undefined,
    verified: true,
    pricePercentChange: {
      "1h": coerceFiniteNumber(s1h?.priceChange),
      "24h": coerceFiniteNumber(s24?.priceChange),
    },
    volumePercentChange: {
      "1h": coerceFiniteNumber(s1h?.volumeChange),
      "24h": coerceFiniteNumber(s24?.volumeChange),
    },
    totalVolume: {
      "5m": volumeFromJupiterStats(s5),
      "1h": volumeFromJupiterStats(s1h),
      "6h": volumeFromJupiterStats(s6h),
      "24h": volumeFromJupiterStats(s24),
    },
    createdAt,
    lastTradeUnixTime,
  } as any;
}

function trendingMetricForV3Sort(row: any, sortV3: string): number {
  const tv = row?.totalVolume ?? {};
  const ppc = row?.pricePercentChange ?? {};
  const vpc = row?.volumePercentChange ?? {};
  const ck = sortV3;

  if (ck === "liquidity") return row?.liquidityUsd ?? 0;
  if (ck === "market_cap") return row?.marketCap ?? 0;
  if (ck === "fdv") return row?.fdv ?? row?.marketCap ?? 0;
  if (ck === "recent_listing_time") return row?.createdAt ?? 0;
  if (ck === "last_trade_unix_time") return row?.lastTradeUnixTime ?? 0;
  if (ck === "holder") return row?.holders ?? 0;

  if (ck.startsWith("volume_") && ck.endsWith("_usd")) {
    if (ck.includes("24h") || ck.includes("7d") || ck.includes("30d"))
      return tv?.["24h"] ?? 0;
    if (ck.includes("1h") || ck.includes("2h"))
      return tv?.["1h"] ?? tv?.["6h"] ?? 0;
    if (ck.includes("30m") || ck.includes("5m") || ck.includes("1m"))
      return tv?.["5m"] ?? 0;
    if (ck.includes("4h") || ck.includes("8h")) return tv?.["6h"] ?? 0;
    return tv?.["24h"] ?? 0;
  }

  if (ck.startsWith("price_change_") && ck.endsWith("_percent")) {
    if (ck.includes("24h") || ck.includes("7d") || ck.includes("30d"))
      return ppc?.["24h"] ?? 0;
    if (ck.includes("1h") || ck.includes("2h") || ck.includes("4h"))
      return ppc?.["1h"] ?? ppc?.["24h"] ?? 0;
    return ppc?.["24h"] ?? 0;
  }

  if (ck.startsWith("volume_") && ck.endsWith("_change_percent")) {
    if (ck.includes("24h") || ck.includes("7d") || ck.includes("30d"))
      return vpc?.["24h"] ?? 0;
    if (ck.includes("1h")) return vpc?.["1h"] ?? vpc?.["24h"] ?? 0;
    return vpc?.["24h"] ?? 0;
  }

  if (ck.startsWith("trade_") && ck.endsWith("_count")) return 0;

  return tv?.["24h"] ?? row?.marketCap ?? 0;
}

function sortTrendingRowsForV3(
  rows: any[],
  sortV3: string,
  sort_type: "asc" | "desc"
) {
  const mul = sort_type === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const va = trendingMetricForV3Sort(a, sortV3);
    const vb = trendingMetricForV3Sort(b, sortV3);
    if (va !== vb) return mul * (va > vb ? 1 : va < vb ? -1 : 0);
    const ma = a?.marketCap ?? 0;
    const mb = b?.marketCap ?? 0;
    if (ma !== mb) return mul * (ma > mb ? 1 : ma < mb ? -1 : 0);
    return String(a?.tokenAddress ?? "").localeCompare(
      String(b?.tokenAddress ?? "")
    );
  });
}

async function getJupiterVerifiedCatalogNormalized(): Promise<any[] | null> {
  const now = Date.now();
  if (
    jupiterVerifiedCatalogCache &&
    jupiterVerifiedCatalogCache.expiresAt > now
  ) {
    return jupiterVerifiedCatalogCache.rows;
  }

  const apiKey = process.env.JUPITER_API_KEY || process.env.JUP_API_KEY || "";

  const tryFetch = async (
    url: string,
    headers: Record<string, string>
  ): Promise<any[] | null> => {
    try {
      const res = await fetch(url, { cache: "no-store", headers });
      if (!res.ok) return null;
      const json = await res.json();
      return Array.isArray(json) && json.length ? json : null;
    } catch {
      return null;
    }
  };

  let raw: any[] | null = null;
  if (apiKey) {
    raw = await tryFetch(JUP_TAG_VERIFIED_PRIMARY, {
      "x-api-key": apiKey,
    });
  }
  if (!raw?.length) {
    raw = await tryFetch(JUP_TAG_VERIFIED_LITE, {});
  }
  if (!raw?.length) return null;

  const rows = raw
    .map((j) => normalizeJupiterVerifiedToken(j))
    .filter(Boolean) as any[];

  jupiterVerifiedCatalogCache = {
    rows,
    expiresAt: now + JUP_VERIFIED_CATALOG_TTL_MS,
  };
  return rows;
}

async function getJupiterVerifiedSet(): Promise<Set<string>> {
  const rows = await getJupiterVerifiedCatalogNormalized();
  if (!rows?.length) return new Set();
  return new Set(
    rows
      .map((r) => String(r?.tokenAddress || "").toLowerCase())
      .filter(Boolean)
  );
}

async function loadSolanaVerifiedPageFromJupiter(opts: {
  offset: number;
  limit: number;
  sort_by: string;
  sort_type: "asc" | "desc";
  min_liquidity: number;
  include_creation: boolean;
  creation_concurrency: number;
  apiKey: string;
}): Promise<{
  finalItems: any[];
  catalogTotal: number;
  filteredTotal: number;
} | null> {
  const {
    offset,
    limit,
    sort_by,
    sort_type,
    min_liquidity,
    include_creation,
    creation_concurrency,
    apiKey,
  } = opts;

  const catalog = await getJupiterVerifiedCatalogNormalized();
  if (!catalog?.length) return null;

  const filtered = catalog.filter(
    (n) => (n?.liquidityUsd ?? 0) >= min_liquidity
  );
  const sortV3 = birdeyeV3SortBy(sort_by);
  const sorted = [...filtered];
  sortTrendingRowsForV3(sorted, sortV3, sort_type);

  const pageItems = sorted.slice(offset, offset + limit);
  const withPricePct = await enrichTokenlistPricePercent24h(
    pageItems,
    "solana",
    apiKey
  );
  const enriched = include_creation
    ? await enrichWithCreation(
        withPricePct,
        "solana",
        apiKey,
        creation_concurrency
      )
    : withPricePct;

  return {
    finalItems: dedupeByAddress(enriched),
    catalogTotal: catalog.length,
    filteredTotal: sorted.length,
  };
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

  const sortV3 = birdeyeV3SortBy(sort_by);
  const { offset: off, limit: lim } = clampBirdeyeV3OffsetLimit(offset, limit);

  const url = new URL(BIRDEYE_TOKENLIST_V3);
  url.searchParams.set("sort_by", sortV3);
  url.searchParams.set("sort_type", sort_type);
  url.searchParams.set("offset", String(off));
  url.searchParams.set("limit", String(lim));
  if (min_liquidity > 0) {
    url.searchParams.set("min_liquidity", String(min_liquidity));
  }
  url.searchParams.set("ui_amount_mode", ui_amount_mode);

  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-chain": chain,
          "x-api-key": apiKey,
        },
        cache: "no-store",
      });
      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      break;
    }
    if (!res) {
      return { ok: false, error: "Birdeye fetch failed", status: 500 };
    }

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
    const tokens: any[] = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.tokens)
        ? data.tokens
        : [];

    const hasNextFromApi =
      typeof data?.hasNext === "boolean"
        ? data.hasNext
        : typeof data?.has_next === "boolean"
          ? data.has_next
          : undefined;
    const hasNext =
      typeof hasNextFromApi === "boolean"
        ? hasNextFromApi
        : tokens.length >= lim;

    const totalExact =
      typeof data?.total === "number" && Number.isFinite(data.total)
        ? data.total
        : undefined;
    const totalMeta =
      totalExact ??
      (!hasNext ? off + tokens.length : undefined);

    return {
      ok: true,
      tokens,
      meta: {
        total: totalMeta,
        updateUnixTime: data?.updateUnixTime ?? null,
        updateTime: data?.updateTime ?? null,
        hasNext,
        pageLimit: lim,
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

/** Birdeye `chain` query param for /defi/v3/search (not always same as `x-chain` token routes). */
function birdeyeSearchChainQuery(chain: string): string {
  const c = (chain || "solana").toLowerCase();
  if (c === "bsc" || c === "56") return "bsc";
  if (c === "base" || c === "8453") return "base";
  if (c === "ethereum" || c === "eth" || c === "1") return "ethereum";
  if (c === "monad" || c === "10143") return "monad";
  if (c === "all") return "all";
  return "solana";
}

function extractBirdeyeSearchTokenRows(json: any): any[] {
  const items =
    json?.data?.items ??
    json?.data?.data?.items ??
    json?.items ??
    (Array.isArray(json?.data) ? json.data : null);
  if (!Array.isArray(items)) return [];

  const out: any[] = [];
  for (const block of items) {
    if (block?.type === "token" && Array.isArray(block?.result)) {
      for (const r of block.result) {
        if (r && typeof r === "object" && r.address) out.push(r);
      }
    }
  }
  return out;
}

/**
 * Fuzzy token search by name/symbol via Uniblock → Birdeye v3/search.
 * Tries multiple sort/search modes — some keywords (e.g. "core") return empty for marketcap-only.
 */
async function fetchBirdeyeSearchTokenResults(opts: {
  keyword: string;
  chain: string;
  apiKey: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  /** Birdeye `verify_token=true` (Solana + `chain=all`) + post-filters for EVM. */
  verifiedOnly?: boolean;
}): Promise<any[]> {
  const keyword = String(opts.keyword || "").trim();
  if (!keyword || keyword.length < 2) return [];

  const chainQ = birdeyeSearchChainQuery(opts.chain);
  const verifiedOnly = opts.verifiedOnly !== false;
  const lim = Math.min(Math.max(1, Math.floor(opts.limit ?? 20)), 20);
  const off = Math.max(0, Math.floor(opts.offset ?? 0));

  const hintSort = opts.sort_by?.trim();
  const strategies: Array<{
    sort_by: string;
    search_by: string;
    search_mode: string;
  }> = [
    ...(hintSort
      ? [{ sort_by: hintSort, search_by: "combination", search_mode: "fuzzy" }]
      : []),
    { sort_by: "volume_24h_usd", search_by: "combination", search_mode: "fuzzy" },
    { sort_by: "marketcap", search_by: "symbol", search_mode: "exact" },
    { sort_by: "volume_24h_usd", search_by: "name", search_mode: "fuzzy" },
  ];

  const seenStrategies = new Set<string>();
  const dedupedStrategies = strategies.filter((s) => {
    const k = `${s.sort_by}|${s.search_by}|${s.search_mode}`;
    if (seenStrategies.has(k)) return false;
    seenStrategies.add(k);
    return true;
  });

  const xChain = chainQ === "all" ? "solana" : chainQ;

  for (const strat of dedupedStrategies) {
    const searchBy = strat.search_by;
    const searchMode = strat.search_mode;
    const sortBy = strat.sort_by;
    const url = new URL(BIRDEYE_V3_SEARCH);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("chain", chainQ);
    url.searchParams.set("target", "token");
    url.searchParams.set("search_mode", searchMode);
    url.searchParams.set("search_by", searchBy);
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_type", "desc");
    url.searchParams.set("limit", String(lim));
    url.searchParams.set("offset", String(off));
    if (chainQ === "solana" || chainQ === "all") {
      url.searchParams.set("ui_amount_mode", "scaled");
    }
    if (verifiedOnly && (chainQ === "solana" || chainQ === "all")) {
      url.searchParams.set("verify_token", "true");
    }

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        "x-api-key": opts.apiKey,
        "x-chain": xChain,
      };

      const res = await fetch(url.toString(), {
        method: "GET",
        headers,
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      if (json?.success === false) continue;
      const rows = extractBirdeyeSearchTokenRows(json);
      if (rows.length) return rows;
    } catch (e) {
      console.warn("Birdeye v3 search error:", e);
    }
  }

  return [];
}

/**
 * Fetches up to `takeCount` v3/search rows starting at Birdeye `startOffset`.
 * API caps limit at 20 per request — uses sequential chunk(s), typically 1–2 calls for 25 rows.
 */
async function fetchBirdeyeSearchWindow(opts: {
  keyword: string;
  chain: string;
  apiKey: string;
  startOffset: number;
  takeCount: number;
  sort_by?: string;
  verifiedOnly?: boolean;
}): Promise<any[]> {
  const takeCount = Math.max(0, Math.floor(opts.takeCount));
  if (takeCount === 0) return [];
  const out: any[] = [];
  let o = Math.max(0, Math.floor(opts.startOffset));
  const sortBy = opts.sort_by || "marketcap";
  const verifiedOnly = opts.verifiedOnly !== false;

  while (out.length < takeCount) {
    const need = takeCount - out.length;
    const pageLen = Math.min(20, need);
    const batch = await fetchBirdeyeSearchTokenResults({
      keyword: opts.keyword,
      chain: opts.chain,
      apiKey: opts.apiKey,
      limit: pageLen,
      offset: o,
      sort_by: sortBy,
      verifiedOnly,
    });
    if (!batch.length) break;
    for (const r of batch) {
      if (out.length >= takeCount) break;
      out.push(r);
    }
    if (batch.length < pageLen) break;
    o += batch.length;
  }
  return out;
}

function chainFromBirdeyeSearchNetwork(net: unknown): string {
  const n = String(net || "solana").toLowerCase();
  if (n === "solana") return "solana";
  if (n === "bsc" || n === "bnb") return "bsc";
  if (n === "base") return "base";
  if (n === "ethereum" || n === "eth") return "ethereum";
  if (n === "monad") return "monad";
  return "solana";
}

function sortRowsByMarketCapThenLiquidity(rows: any[]): any[] {
  return [...rows].sort(
    (a, b) =>
      (b.marketCap ?? 0) - (a.marketCap ?? 0) ||
      (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)
  );
}

const TRENDING_SEARCH_FETCH_CHUNK = 60;

/**
 * Pulls enough upstream `v3/search` rows, then filters to trusted + liquidity-sane
 * so a full page still has `limit` items when the API interleaves garbage.
 */
async function collectTickerSearchPage(opts: {
  keyword: string;
  apiKey: string;
  birdeyeOffset: number;
  limit: number;
  chainFetch: string;
  normalizeRows: (rows: any[]) => any[];
  sort_by?: string;
}): Promise<{ items: any[]; hasMore: boolean }> {
  const want = opts.limit + 1;
  const acc: any[] = [];
  const seen = new Set<string>();
  let cursor = opts.birdeyeOffset;
  let exhausted = false;
  let loops = 0;

  while (acc.length < want && !exhausted && loops < 16) {
    loops++;
    const rows = await fetchBirdeyeSearchWindow({
      keyword: opts.keyword,
      chain: opts.chainFetch,
      apiKey: opts.apiKey,
      startOffset: cursor,
      takeCount: TRENDING_SEARCH_FETCH_CHUNK,
      sort_by: opts.sort_by ?? "marketcap",
      verifiedOnly: true,
    });
    if (!rows.length) {
      exhausted = true;
      break;
    }
    cursor += rows.length;

    let normalized = opts.normalizeRows(rows);
    normalized = dedupeByAddress(normalized);
    normalized = sortRowsByMarketCapThenLiquidity(normalized);
    const finalized = applyTickerSearchResultFilter(normalized, opts.chainFetch);

    for (const it of finalized) {
      const k = tokenAddressLookupKey(
        String(it.chainId ?? ""),
        String(it.tokenAddress ?? "")
      );
      if (!k || seen.has(k)) continue;
      seen.add(k);
      acc.push(it);
      if (acc.length >= want) break;
    }

    if (rows.length < TRENDING_SEARCH_FETCH_CHUNK) exhausted = true;
  }

  const hasMore = acc.length > opts.limit;
  return { items: acc.slice(0, opts.limit), hasMore };
}

async function buildSolanaTickerSearchPage(
  search_query: string,
  apiKey: string,
  limit: number,
  offset: number
): Promise<{ items: any[]; hasMore: boolean }> {
  return collectTickerSearchPage({
    keyword: search_query,
    apiKey,
    birdeyeOffset: offset,
    limit,
    chainFetch: "solana",
    sort_by: "marketcap",
    normalizeRows: (rows) =>
      rows.map((r) => normalizeTokenlistToken(r, "solana")),
  });
}

async function buildAllChainsTickerSearchPage(
  search_query: string,
  apiKey: string,
  limit: number,
  offset: number
): Promise<{ items: any[]; hasMore: boolean }> {
  return collectTickerSearchPage({
    keyword: search_query,
    apiKey,
    birdeyeOffset: offset,
    limit,
    chainFetch: "all",
    sort_by: "marketcap",
    normalizeRows: (rows) =>
      rows.map((r) =>
        normalizeTokenlistToken(r, chainFromBirdeyeSearchNetwork(r?.network))
      ),
  });
}

async function tickerSearchRowsFromBirdeyeV3Paged(
  search_query: string,
  chain: string,
  apiKey: string,
  limit: number,
  offset: number
): Promise<{ items: any[]; hasMore: boolean }> {
  return collectTickerSearchPage({
    keyword: search_query,
    apiKey,
    birdeyeOffset: offset,
    limit,
    chainFetch: chain,
    sort_by: "marketcap",
    normalizeRows: (rows) => {
      let normalized = rows.map((t) => normalizeTokenlistToken(t, chain));
      let filtered = filterValidMarketCap(normalized, chain);
      if (!filtered.length && normalized.length) filtered = normalized;
      return filtered;
    },
  });
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

function hasUsableCreationTimestamp(ts: unknown): boolean {
  return typeof ts === "number" && Number.isFinite(ts) && ts > 946684800;
}

/**
 * Token list responses only include v24hChangePercent (volume). Real 24h price % lives on
 * token_overview — without this merge, Mcap/Price columns have no % while Vol does.
 * Also merges `createdAt` from overview when the list omits it (reduces extra creation_info calls).
 */
async function enrichTokenlistPricePercent24h(
  items: any[],
  chain: string,
  apiKey: string
): Promise<any[]> {
  if (!items.length) return items;

  const need = items.filter(
    (n) =>
      n?.tokenAddress &&
      (n?.pricePercentChange?.["24h"] == null ||
        !Number.isFinite(n.pricePercentChange["24h"]) ||
        !hasUsableCreationTimestamp(n?.createdAt))
  );
  if (!need.length) return items;

  const mintList: string[] = [];
  const mintSeen = new Set<string>();
  for (const n of need) {
    const raw = String(n.tokenAddress || "").trim();
    if (!raw) continue;
    const dedupeKey = tokenAddressLookupKey(chain, raw);
    if (!dedupeKey || mintSeen.has(dedupeKey)) continue;
    mintSeen.add(dedupeKey);
    mintList.push(birdeyeTokenAddressParam(chain, raw));
  }
  if (!mintList.length) return items;

  const limiter = createLimiter(8);
  const pairs = await Promise.all(
    mintList.map((mint) =>
      limiter(async () => {
        const data = await fetchBirdeyeTokenOverview(mint, chain, apiKey);
        return { mint, data };
      })
    )
  );

  const byAddrPrice = new Map<string, number>();
  const byAddrCreated = new Map<string, number>();
  for (const { mint, data } of pairs) {
    if (!data) continue;
    const norm = normalizeBirdeyeTokenOverview(data, chain);
    const keyFromMint = tokenAddressLookupKey(chain, mint);
    const keys: string[] = [];
    if (keyFromMint) keys.push(keyFromMint);
    const ret = norm?.tokenAddress;
    if (ret) {
      const k2 = tokenAddressLookupKey(chain, ret);
      if (k2 && k2 !== keyFromMint) keys.push(k2);
    }
    if (!keys.length) continue;

    const p24 = norm?.pricePercentChange?.["24h"];
    if (typeof p24 === "number" && Number.isFinite(p24)) {
      for (const k of keys) byAddrPrice.set(k, p24);
    }
    const ca = norm?.createdAt;
    if (hasUsableCreationTimestamp(ca)) {
      for (const k of keys) byAddrCreated.set(k, ca as number);
    }
  }

  if (!byAddrPrice.size && !byAddrCreated.size) return items;

  return items.map((row) => {
    const key = tokenAddressLookupKey(chain, String(row?.tokenAddress || ""));
    const p24 = key ? byAddrPrice.get(key) : undefined;
    const createdFromOv = key ? byAddrCreated.get(key) : undefined;

    let next = row;
    if (p24 != null) {
      next = {
        ...next,
        pricePercentChange: {
          ...(next.pricePercentChange || {}),
          "24h": p24,
        },
      };
    }
    if (
      createdFromOv != null &&
      !hasUsableCreationTimestamp(next?.createdAt)
    ) {
      next = { ...next, createdAt: createdFromOv };
    }
    return next;
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
        "x-api-key": apiKey,
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

// ------- Search Handler -------
async function handleTokenSearch(opts: {
  search_query: string;
  search_type: "ticker" | "address";
  chain: string;
  apiKey: string;
  limit: number;
  offset: number;
  include_creation: boolean;
  creation_concurrency: number;
}): Promise<NextResponse> {
  const {
    search_query,
    search_type,
    chain,
    apiKey,
    limit,
    offset,
    include_creation,
    creation_concurrency,
  } = opts;

  try {
    let searchResults: any[] = [];
    /** Ticker search: false when Birdeye returned a full page+1 probe (more rows exist). */
    let searchExhausted = true;

    if (search_type === "address") {
      const q = search_query.trim();
      const isEvm = /^0x[a-fA-F0-9]{40}$/.test(q);

      let targetChain: string;
      let tokenData: any | null = null;

      if (chain !== "all") {
        targetChain = chain;
        tokenData = await fetchBirdeyeTokenOverview(q, targetChain, apiKey);
      } else if (isEvm) {
        // Try EVM chains in order — previously only BSC, which mis-resolved Base contracts.
        targetChain = "bsc";
        const evmCandidates = ["ethereum", "bsc", "base", "monad"] as const;
        for (const c of evmCandidates) {
          const data = await fetchBirdeyeTokenOverview(q, c, apiKey);
          if (data) {
            tokenData = data;
            targetChain = c;
            break;
          }
        }
      } else {
        targetChain = "solana";
        tokenData = await fetchBirdeyeTokenOverview(q, targetChain, apiKey);
      }

      if (!tokenData) {
        return NextResponse.json({
          items: [],
          uniqueCount: 0,
          offset,
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

      const searchResult = normalizeBirdeyeTokenOverview(tokenData, targetChain);
      searchResults = [searchResult];
    } else if (search_type === "ticker") {
      if (
        chain === "bsc" ||
        chain === "base" ||
        chain === "monad" ||
        chain === "ethereum"
      ) {
        const page = await tickerSearchRowsFromBirdeyeV3Paged(
          search_query,
          chain,
          apiKey,
          limit,
          offset
        );
        searchResults = page.items;
        searchExhausted = !page.hasMore;
      } else if (chain === "all") {
        const page = await buildAllChainsTickerSearchPage(
          search_query,
          apiKey,
          limit,
          offset
        );
        searchResults = page.items;
        searchExhausted = !page.hasMore;
      } else {
        const page = await buildSolanaTickerSearchPage(
          search_query,
          apiKey,
          limit,
          offset
        );
        searchResults = page.items;
        searchExhausted = !page.hasMore;
      }

      if (!searchResults.length) {
        return NextResponse.json({
          items: [],
          uniqueCount: 0,
          offset,
          limit,
          chain,
          upstreamTotal: offset,
          exhausted: true,
          searchQuery: search_query,
          searchType: search_type,
          searchResults: true,
          message: `No tokens found for: ${search_query}`,
        });
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

    const creationChain =
      sortedResults[0]?.chainId != null
        ? String(sortedResults[0].chainId)
        : chain;

    const enrichedResults = include_creation
      ? await enrichWithCreation(
          sortedResults,
          creationChain,
          apiKey,
          creation_concurrency
        )
      : sortedResults;

    return NextResponse.json({
      items: enrichedResults,
      uniqueCount: enrichedResults.length,
      offset,
      limit,
      chain: search_type === "address" ? creationChain : chain,
      upstreamTotal: searchExhausted
        ? offset + enrichedResults.length
        : undefined,
      exhausted: searchExhausted,
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

  // Proportional split across four chains
  const perChain = Math.ceil(limit / 4);
  const solanaLimit = perChain;
  const bnbLimit = perChain;
  const ethereumLimit = perChain;
  const baseLimit = perChain;
  const solanaOffset = Math.floor(offset / 4);
  const bnbOffset = Math.floor(offset / 4);
  const ethereumOffset = Math.floor(offset / 4);
  const baseOffset = Math.floor(offset / 4);

  // Fetch all four chains in parallel
  const [solanaTokens, bnbTokens, ethereumTokens, baseTokens] = await Promise.all([
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
      chain: "ethereum",
      limit: ethereumLimit,
      offset: ethereumOffset,
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

  // Interleave: round-robin base, ethereum, bnb, solana
  const mixed: any[] = [];
  const maxLength = Math.max(
    solanaTokens.length,
    bnbTokens.length,
    ethereumTokens.length,
    baseTokens.length
  );
  for (let i = 0; i < maxLength; i++) {
    if (i < baseTokens.length) mixed.push(baseTokens[i]);
    if (i < ethereumTokens.length) mixed.push(ethereumTokens[i]);
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
        ethereum: ethereumTokens.length,
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
    // Get verified set based on chain (Base/Ethereum/Monad have no verified list here)
    let verifiedSet: Set<string> | null = null;
    if (verified_only) {
      if (chain === "solana") {
        const jPage = await loadSolanaVerifiedPageFromJupiter({
          offset,
          limit,
          sort_by,
          sort_type,
          min_liquidity,
          include_creation,
          creation_concurrency,
          apiKey,
        });
        if (jPage) return jPage.finalItems;
        verifiedSet = await getJupiterVerifiedSet();
      } else if (chain === "bsc") {
        verifiedSet = await getBnbVerifiedSet();
      }
      // base/ethereum/monad: no verified list, verifiedSet stays null so we return all
    }

    const collected: any[] = [];
    let birdeyeOffset = offset;
    const batchLimit = Math.min(BIRDEYE_V3_LIST_MAX, limit);
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

      if (listed.meta.hasNext === false) break;
      if (listed.tokens.length < listed.meta.pageLimit) break;
      birdeyeOffset += listed.tokens.length;
      if (birdeyeOffset >= BIRDEYE_V3_OFFSET_LIMIT_MAX_SUM) break;
    }

    // Enrich with creation info
    const pageItems = collected.slice(0, limit);
    const withPricePct = await enrichTokenlistPricePercent24h(
      pageItems,
      chain,
      apiKey
    );
    const enriched = include_creation
      ? await enrichWithCreation(withPricePct, chain, apiKey, creation_concurrency)
      : withPricePct;

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

  const apiKey = process.env.UNIBLOCK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing UNIBLOCK_API_KEY" },
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
      offset,
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

  // Solana + verified: serve from Jupiter catalog (cached) — avoids hammering Birdeye /token/list (429).
  if (chain === "solana" && verified_only) {
    const jPage = await loadSolanaVerifiedPageFromJupiter({
      offset,
      limit,
      sort_by,
      sort_type,
      min_liquidity,
      include_creation,
      creation_concurrency,
      apiKey,
    });
    if (jPage) {
      const res = NextResponse.json(
        {
          items: jPage.finalItems,
          uniqueCount: jPage.finalItems.length,
          offset,
          limit,
          chain,
          updateUnixTime: undefined,
          updateTime: undefined,
          min_liquidity,
          sort_by,
          sort_type,
          ui_amount_mode,
          verified_only,
          force_full_scan,
          upstreamTotal: jPage.filteredTotal,
          verifiedTotal: jPage.filteredTotal,
          jupVerifiedTotal: jPage.catalogTotal,
          filteredTotal: jPage.filteredTotal,
          verifiedTotalFiltered: jPage.filteredTotal,
          verifiedTotalLowerBound: null,
          exhausted: true,
        },
        { status: 200 }
      );
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
  }

  // Get verified set based on chain
  let verifiedSet: Set<string> | null = null;
  let verifiedTotal: number | undefined;

  if (chain === "solana") {
    if (verified_only) {
      const jupVerifiedSet = await getJupiterVerifiedSet();
      verifiedSet = jupVerifiedSet;
      verifiedTotal = jupVerifiedSet.size;
    } else {
      verifiedSet = null;
      verifiedTotal = undefined;
    }
  } else if (chain === "bsc") {
    if (verified_only) {
      const bnbVerifiedSet = await getBnbVerifiedSet();
      verifiedSet = bnbVerifiedSet;
      verifiedTotal = bnbVerifiedSet.size;
    } else {
      verifiedSet = null;
      verifiedTotal = undefined;
    }
  } else if (chain === "base" || chain === "monad" || chain === "ethereum") {
    // Base / Monad / Ethereum: no verified list; show all tokens
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
  const maxBatches = needVerifiedTotal ? 9999 : 40; // safety valves
  let batches = 0;
  let exhausted = false;
  const targetListLen = offset + limit;

  while (batches < maxBatches) {
    if (!needVerifiedTotal && collected.length >= targetListLen) break;
    batches++;

    const remainingSlots = targetListLen - collected.length;
    const batchLimit =
      needPostFilterPagination && verifiedSet
        ? BIRDEYE_V3_LIST_MAX
        : Math.min(
            BIRDEYE_V3_LIST_MAX,
            Math.max(1, remainingSlots)
          );

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
    if (!needVerifiedTotal && collected.length >= targetListLen) break;

    if (listed.meta.hasNext === false || !listed.tokens.length) {
      exhausted = true;
      break;
    }
    if (listed.tokens.length < listed.meta.pageLimit) {
      exhausted = true;
      break;
    }

    birdeyeOffset += listed.tokens.length;
    if (birdeyeOffset >= BIRDEYE_V3_OFFSET_LIMIT_MAX_SUM) {
      exhausted = true;
      break;
    }
  }

  // Slice the filtered collection for this page
  const pageItems = collected.slice(offset, offset + limit);

  const pageWithPricePct = await enrichTokenlistPricePercent24h(
    pageItems,
    chain,
    apiKey
  );

  // Optional: Creation enrichment on the page slice only
  const enriched = include_creation
    ? await enrichWithCreation(
        pageWithPricePct,
        chain,
        apiKey,
        creation_concurrency
      )
    : pageWithPricePct;

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
