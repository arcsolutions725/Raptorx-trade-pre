/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DexScreener market overlay for the screener table.
 *
 * The table's Mcap sits next to an embedded DexScreener chart, so the two have to
 * agree. They can only agree if they come from the same place: Birdeye's `mc` and
 * DexScreener's `marketCap` are built from different supply data and disagree even
 * when both are perfectly fresh.
 *
 * So Birdeye stays the source of *discovery* — which tokens, in what order, with
 * what volume and liquidity — and DexScreener supplies the numbers we actually
 * render: market cap, price, and the pair the chart will open.
 *
 * Cost is one batched call per page (30 addresses per request), cached per token
 * for `TTL_MS` with an in-flight dedupe, so concurrent viewers of the same chain
 * collapse into a single upstream call. This is the same shape as the Robinhood
 * path in `robinhoodTokens.ts`, which already tracks the live chart.
 *
 * Deliberately NOT `unstable_cache`: its stale-while-revalidate serves an old
 * snapshot while refreshing behind it, which is exactly what made the Mcap column
 * drift away from the chart. An expired read here *waits* for a fresh value.
 */

import { DEX_CHAIN_SLUG } from "@/lib/api/dexscreener";
import { getLiveQuotePerBase } from "@/lib/livePoolPrice";

const DS = "https://api.dexscreener.com";

/** DexScreener caps the chain-scoped endpoint at 30 addresses per call. */
const BATCH_SIZE = 30;

/** Matches the table's 5s client poll — the freshest the UI can actually show. */
const TTL_MS = 5_000;

/**
 * If DexScreener is slow we fall back to Birdeye's numbers rather than hold the
 * whole table hostage. DexScreener normally answers in a few hundred ms.
 */
const FETCH_TIMEOUT_MS = 2_500;

export type DexMarketRow = {
  marketCap?: number;
  usdPrice?: number;
  pairAddress?: string;
  quoteSymbol?: string;
};

type Entry = { at: number; row: DexMarketRow | null };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const cacheKey = (slug: string, address: string) =>
  `${slug}|${address.toLowerCase()}`;

/** Drop entries well past their TTL so long-lived instances don't grow forever. */
function prune(now: number) {
  if (cache.size < 5_000) return;
  for (const [k, v] of cache) {
    if (now - v.at > TTL_MS * 20) cache.delete(k);
  }
}

async function fetchBatchInto(slug: string, addresses: string[]): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  let pairs: any[] = [];
  try {
    const res = await fetch(`${DS}/tokens/v1/${slug}/${addresses.join(",")}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`dexscreener ${res.status}`);
    const j = await res.json();
    pairs = Array.isArray(j) ? j : (j?.pairs ?? []);
  } catch {
    // Cache the miss: a transient DexScreener failure must not turn every
    // subsequent request into another slow, timing-out call. These rows fall back
    // to Birdeye's numbers and re-resolve on the next TTL window.
    const now = Date.now();
    for (const a of addresses) {
      const k = cacheKey(slug, a);
      if (!cache.has(k)) cache.set(k, { at: now, row: null });
    }
    return;
  } finally {
    clearTimeout(timer);
  }

  // One row per token, keeping the deepest-liquidity pair — that is the pair
  // DexScreener itself opens by default, so the chart shows what the row shows.
  //
  // Only pairs where our token is the BASE token count: in a pair where it is the
  // quote, `marketCap` describes the *other* token entirely.
  const wanted = new Set(addresses.map((a) => a.toLowerCase()));
  const best = new Map<string, any>();
  for (const p of pairs) {
    const base = String(p?.baseToken?.address ?? "").toLowerCase();
    if (!base || !wanted.has(base)) continue;
    const prev = best.get(base);
    if (!prev || (num(p?.liquidity?.usd) ?? 0) > (num(prev?.liquidity?.usd) ?? 0)) {
      best.set(base, p);
    }
  }

  // Re-price the snapshot against the live on-chain pool so the Mcap tracks the
  // chart within seconds instead of trailing DexScreener's ~30s CDN cache. EVM
  // only; Solana and unreadable pools keep the snapshot untouched (empty map).
  const liveEntries: { pair: string; base: string }[] = [];
  for (const p of best.values()) {
    const pair = typeof p?.pairAddress === "string" ? p.pairAddress : "";
    const base = String(p?.baseToken?.address ?? "");
    if (pair && base) liveEntries.push({ pair, base });
  }
  let liveQpb = new Map<string, number>();
  try {
    liveQpb = await getLiveQuotePerBase(slug, liveEntries);
  } catch {
    liveQpb = new Map();
  }

  const now = Date.now();
  for (const a of addresses) {
    const lower = a.toLowerCase();
    const p = best.get(lower);
    if (!p) {
      cache.set(cacheKey(slug, a), { at: now, row: null });
      continue;
    }

    // `marketCap ?? fdv` mirrors what DexScreener prints as "MKT CAP":
    // it falls back to FDV itself when circulating supply is unknown.
    let marketCap = num(p?.marketCap) ?? num(p?.fdv);
    let usdPrice = num(p?.priceUsd);

    // Scale by the live/snapshot price ratio, both in the quote asset. Supply and
    // quote→USD cancel, so a fresh pool price is all we need. Guard the ratio to a
    // sane band: a wild multiplier means bad data (stale snapshot priceNative, a
    // pool with near-zero reserves), and we'd rather show the snapshot than a
    // garbage number.
    const pairAddr =
      typeof p?.pairAddress === "string" ? p.pairAddress.toLowerCase() : "";
    const liveQuotePerBase = pairAddr ? liveQpb.get(pairAddr) : undefined;
    const snapQuotePerBase = num(p?.priceNative);
    if (liveQuotePerBase && snapQuotePerBase) {
      const ratio = liveQuotePerBase / snapQuotePerBase;
      if (Number.isFinite(ratio) && ratio > 0.5 && ratio < 2) {
        if (marketCap) marketCap *= ratio;
        if (usdPrice) usdPrice *= ratio;
      }
    }

    const row: DexMarketRow = {
      marketCap,
      usdPrice,
      pairAddress:
        typeof p?.pairAddress === "string" ? p.pairAddress : undefined,
      quoteSymbol:
        typeof p?.quoteToken?.symbol === "string"
          ? p.quoteToken.symbol
          : undefined,
    };
    cache.set(cacheKey(slug, a), { at: now, row });
  }
}

/**
 * Live market data for a page of tokens, keyed by lowercased address.
 * Tokens DexScreener doesn't know about are simply absent — callers keep their
 * existing (Birdeye) values for those.
 */
export async function getDexMarketData(
  chain: string,
  addresses: string[]
): Promise<Map<string, DexMarketRow>> {
  const out = new Map<string, DexMarketRow>();
  const slug = DEX_CHAIN_SLUG[String(chain || "").toLowerCase()];
  if (!slug) return out;

  const uniq = Array.from(
    new Set(
      addresses
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .filter(Boolean)
    )
  );
  if (!uniq.length) return out;

  const now = Date.now();
  const waits: Promise<void>[] = [];
  const need: string[] = [];

  for (const a of uniq) {
    const k = cacheKey(slug, a);
    const hit = cache.get(k);
    if (hit && now - hit.at < TTL_MS) continue; // fresh enough
    const running = inflight.get(k);
    if (running) {
      waits.push(running); // someone else is already fetching this token
      continue;
    }
    need.push(a);
  }

  for (let i = 0; i < need.length; i += BATCH_SIZE) {
    const batch = need.slice(i, i + BATCH_SIZE);
    const p = fetchBatchInto(slug, batch).finally(() => {
      for (const a of batch) inflight.delete(cacheKey(slug, a));
    });
    for (const a of batch) inflight.set(cacheKey(slug, a), p);
    waits.push(p);
  }

  // Wait for fresh values rather than serving what we happen to have.
  if (waits.length) await Promise.all(waits);
  prune(now);

  for (const a of uniq) {
    const hit = cache.get(cacheKey(slug, a));
    if (hit?.row) out.set(a.toLowerCase(), hit.row);
  }
  return out;
}

/**
 * Overlay live DexScreener market data onto screener rows.
 *
 * Only market cap and price are replaced — the numbers rendered beside the chart.
 * Volume and liquidity stay on Birdeye's aggregate figures, which span every pool
 * rather than just the deepest one. `pairAddress` is passed through so the chart
 * embed opens the exact pair these numbers came from.
 */
export async function applyDexMarketOverlay(
  items: any[],
  chain: string
): Promise<any[]> {
  if (!items.length) return items;

  const byAddress = await getDexMarketData(
    chain,
    items.map((it) => String(it?.tokenAddress ?? ""))
  );
  if (!byAddress.size) return items;

  return items.map((it) => {
    const row = byAddress.get(String(it?.tokenAddress ?? "").toLowerCase());
    if (!row) return it;
    return {
      ...it,
      marketCap: row.marketCap ?? it?.marketCap,
      usdPrice: row.usdPrice ?? it?.usdPrice,
      pairAddress: row.pairAddress ?? it?.pairAddress,
      quoteSymbol: row.quoteSymbol ?? it?.quoteSymbol,
    };
  });
}
