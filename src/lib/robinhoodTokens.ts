/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Robinhood Chain token screener data — sourced from DexScreener, because
 * Uniblock/Birdeye does not support Robinhood ("chain not supported yet").
 *
 * DexScreener has no "list all pairs on a chain" endpoint, so we discover
 * Robinhood tokens from several sources (Li.Fi's token list, GeckoTerminal's
 * per-network pool listing, DexScreener's discovery feeds), then fetch full
 * pair data and map it to the same shape the trending table uses. Age comes
 * free from DexScreener's `pairCreatedAt` (no Birdeye needed).
 */
import { unstable_cache } from "next/cache";

const DS = "https://api.dexscreener.com";
const GT = "https://api.geckoterminal.com/api/v2";
const CHAIN = "robinhood";
/** Robinhood Chain id in Li.Fi (used to enumerate the full tradeable token set). */
const LIFI_ROBINHOOD_CHAIN_ID = 4663;
/**
 * The chain's main quote tokens (WETH, USDG). Enumerating *their* pairs on
 * DexScreener surfaces every token traded against them — a backstop for tokens
 * missing from both Li.Fi and GeckoTerminal.
 */
const QUOTE_TOKEN_ADDRESSES = [
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", // WETH
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
];

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Discover Robinhood token addresses. */
async function discoverAddresses(): Promise<string[]> {
  // Lowercased for dedup — sources disagree on address casing (Li.Fi checksums,
  // GeckoTerminal lowercases). DexScreener lookups are case-insensitive.
  const set = new Set<string>();
  const add = (a: unknown) => {
    // Skip the native-token placeholder (no DexScreener pair).
    if (typeof a === "string" && a && !/^0x0{40}$/i.test(a)) {
      set.add(a.toLowerCase());
    }
  };

  const [lifi, feeds, search, gtPages, quotePairLists] = await Promise.all([
    // Li.Fi's token list for Robinhood Chain (id 4663) — the curated tradeable
    // set (tokenized stocks + majors). Misses most memecoins.
    getJson(`https://li.quest/v1/tokens?chains=${LIFI_ROBINHOOD_CHAIN_ID}`),
    // DexScreener's discovery feeds — only boosted/profiled tokens.
    Promise.all([
      getJson(`${DS}/token-profiles/latest/v1`),
      getJson(`${DS}/token-boosts/latest/v1`),
      getJson(`${DS}/token-boosts/top/v1`),
    ]),
    // Search surfaces some pairs directly (tokens literally named "robinhood").
    getJson(`${DS}/latest/dex/search?q=robinhood`),
    // GeckoTerminal enumerates a chain's pools directly — the only source here
    // that lists the chain wholesale, and what catches actively-traded tokens
    // absent everywhere else (e.g. $TENDIES). Public API caps at 10 pages × 20
    // pools; sorted by 24h volume so the cap drops only the least-traded tail.
    Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        getJson(`${GT}/networks/${CHAIN}/pools?page=${i + 1}&sort=h24_volume_usd_desc`),
      ),
    ),
    // DexScreener-native backstop for the same gap: the top ~30 pairs of each
    // main quote token — keeps new tokens appearing if GeckoTerminal rate-limits.
    Promise.all(
      QUOTE_TOKEN_ADDRESSES.map((a) => getJson(`${DS}/token-pairs/v1/${CHAIN}/${a}`)),
    ),
  ]);

  const lifiTokens = lifi?.tokens?.[String(LIFI_ROBINHOOD_CHAIN_ID)];
  if (Array.isArray(lifiTokens)) {
    for (const t of lifiTokens) add(t?.address);
  }

  for (const feed of feeds) {
    if (!Array.isArray(feed)) continue;
    for (const x of feed) {
      if (x?.chainId === CHAIN) add(x?.tokenAddress);
    }
  }

  for (const p of search?.pairs ?? []) {
    if (p?.chainId === CHAIN) add(p?.baseToken?.address);
  }

  for (const page of gtPages) {
    if (!Array.isArray(page?.data)) continue;
    for (const pool of page.data) {
      // Token ids look like "robinhood_0xabc…"; a token can sit on either side
      // of a pool (e.g. "WETH / AnsemCat"), so take both.
      for (const side of ["base_token", "quote_token"]) {
        const id = pool?.relationships?.[side]?.data?.id;
        if (typeof id === "string" && id.startsWith(`${CHAIN}_`)) {
          add(id.slice(CHAIN.length + 1));
        }
      }
    }
  }

  for (const list of quotePairLists) {
    const pairs = Array.isArray(list) ? list : (list?.pairs ?? []);
    for (const p of pairs) {
      if (p?.chainId === CHAIN) {
        add(p?.baseToken?.address);
        add(p?.quoteToken?.address);
      }
    }
  }

  return [...set];
}

/**
 * Fetch full pair data for a set of token addresses (up to 30 per call).
 * Uses the CHAIN-SCOPED endpoint `/tokens/v1/{chain}/{addresses}` — the generic
 * `/latest/dex/tokens/{addresses}` endpoint caps its response at ~30 pairs across
 * ALL chains and silently drops tokens (e.g. $CASHCAT).
 */
async function fetchPairs(addresses: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    const j = await getJson(`${DS}/tokens/v1/${CHAIN}/${batch.join(",")}`);
    const pairs = Array.isArray(j) ? j : (j?.pairs ?? []);
    for (const p of pairs) {
      if (p?.chainId === CHAIN) out.push(p);
    }
  }
  return out;
}

function mapPairToToken(p: any) {
  const b = p?.baseToken ?? {};
  const created = num(p?.pairCreatedAt);
  return {
    chainId: CHAIN,
    tokenAddress: b.address,
    name: b.name ?? undefined,
    symbol: b.symbol ?? undefined,
    uniqueName: null,
    decimals: undefined,
    logo: p?.info?.imageUrl ?? undefined,
    usdPrice: num(p?.priceUsd),
    marketCap: num(p?.marketCap) ?? num(p?.fdv),
    liquidityUsd: num(p?.liquidity?.usd),
    pricePercentChange: {
      "1h": num(p?.priceChange?.h1),
      "4h": num(p?.priceChange?.h6),
      "24h": num(p?.priceChange?.h24),
    },
    volumePercentChange: { "24h": undefined },
    totalVolume: {
      "1h": num(p?.volume?.h1),
      "4h": num(p?.volume?.h6),
      "24h": num(p?.volume?.h24),
    },
    // DexScreener gives creation time in ms → seconds (Age works with no Birdeye lookup).
    createdAt: typeof created === "number" ? Math.floor(created / 1000) : undefined,
    lastTradeUnixTime: undefined,
    pairAddress: p?.pairAddress ?? undefined,
    // Real quote token of the pair (e.g. WETH, USDG) so the "X / quote" label is exact.
    quoteSymbol: p?.quoteToken?.symbol ?? undefined,
    verified: true,
  } as any;
}

/**
 * One Robinhood token by contract address, in trending-row shape.
 *
 * Goes straight to the chain-scoped DexScreener endpoint rather than looking the
 * address up in `getRobinhoodTokens()`: a curated Golden/Pump project may not be
 * in the discovery feeds yet, and it must still render.
 */
export async function getRobinhoodTokenByAddress(
  address: string,
): Promise<any | null> {
  const addr = address.trim();
  if (!addr) return null;
  // DexScreener returns every pair the address appears in — keep only the ones
  // where it is the *base* token, else we'd map a row for its quote token.
  const pairs = (await fetchPairs([addr])).filter(
    (p) =>
      typeof p?.baseToken?.address === "string" &&
      p.baseToken.address.toLowerCase() === addr.toLowerCase(),
  );
  if (!pairs.length) return null;
  const best = pairs.reduce((a, b) =>
    (num(b?.liquidity?.usd) ?? 0) > (num(a?.liquidity?.usd) ?? 0) ? b : a,
  );
  const row = mapPairToToken(best);
  return row.tokenAddress ? row : null;
}

/**
 * Ticker/name search over Robinhood tokens, in trending-row shape, sorted by
 * market cap then liquidity (same order the Birdeye-backed chains use).
 *
 * Matches the cached list first, then supplements with DexScreener's search
 * endpoint so tokens discovery hasn't picked up yet are still findable.
 */
export async function searchRobinhoodTokens(query: string): Promise<any[]> {
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  if (!q) return [];

  const all = await getRobinhoodTokens();
  const matchesQ = (t: any) =>
    String(t?.symbol ?? "").toLowerCase().includes(q) ||
    String(t?.name ?? "").toLowerCase().includes(q);
  const matches = all.filter(matchesQ);
  const seen = new Set(
    matches.map((t) => String(t.tokenAddress).toLowerCase()),
  );

  const ds = await getJson(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`);
  const extra = new Map<string, any>();
  for (const p of ds?.pairs ?? []) {
    if (p?.chainId !== CHAIN) continue;
    const a =
      typeof p?.baseToken?.address === "string"
        ? p.baseToken.address.toLowerCase()
        : "";
    if (!a || seen.has(a)) continue;
    if (!matchesQ(p.baseToken)) continue;
    const prev = extra.get(a);
    if (!prev || (num(p?.liquidity?.usd) ?? 0) > (num(prev?.liquidity?.usd) ?? 0)) {
      extra.set(a, p);
    }
  }
  matches.push(
    ...[...extra.values()].map(mapPairToToken).filter((t) => t.tokenAddress),
  );

  matches.sort(
    (x, y) =>
      (y.marketCap ?? 0) - (x.marketCap ?? 0) ||
      (y.liquidityUsd ?? 0) - (x.liquidityUsd ?? 0),
  );
  return matches;
}

/**
 * The token *set* changes rarely (a new Robinhood listing now and then), but
 * discovering it is the expensive part — a Li.Fi enumeration plus several
 * DexScreener discovery feeds. Cache it separately and for much longer, so the
 * price data below can be refreshed often without re-running discovery.
 */
const getRobinhoodAddresses = unstable_cache(
  discoverAddresses,
  ["robinhood-addresses-v2"],
  { revalidate: 300, tags: ["robinhood-tokens"] },
);

async function buildRobinhoodTokens(): Promise<any[]> {
  const addrs = await getRobinhoodAddresses();
  if (!addrs.length) return [];
  // Cheap-ish: ~1 chain-scoped DexScreener call per 30 tokens. This is what
  // makes a short price TTL affordable.
  const pairs = await fetchPairs(addrs);
  // One row per token — keep the deepest-liquidity pair.
  const byToken = new Map<string, any>();
  for (const p of pairs) {
    const a = p?.baseToken?.address;
    if (!a) continue;
    const prev = byToken.get(a);
    if (!prev || (num(p?.liquidity?.usd) ?? 0) > (num(prev?.liquidity?.usd) ?? 0)) {
      byToken.set(a, p);
    }
  }
  const items = [...byToken.values()].map(mapPairToToken).filter((t) => t.tokenAddress);
  items.sort((x, y) => (y.totalVolume?.["24h"] ?? 0) - (x.totalVolume?.["24h"] ?? 0));
  return items;
}

/**
 * Robinhood tokens with prices/market caps, sorted by 24h volume desc.
 *
 * In-memory TTL (not Next `unstable_cache`) so expired reads *wait* for a fresh
 * DexScreener fetch instead of serving SWR-stale snapshots. That was the main
 * reason the table Mcap lagged the live DexScreener chart by 1–2%+. Affordable
 * because address discovery is cached separately — a rebuild is ~2 API calls.
 */
const PRICE_TTL_MS = 5_000;
let priceCache: { at: number; data: any[] } | null = null;
let priceInflight: Promise<any[]> | null = null;

export async function getRobinhoodTokens(): Promise<any[]> {
  if (priceCache && Date.now() - priceCache.at < PRICE_TTL_MS) {
    return priceCache.data;
  }
  if (priceInflight) return priceInflight;
  priceInflight = buildRobinhoodTokens()
    .then((data) => {
      priceCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      priceInflight = null;
    });
  return priceInflight;
}
