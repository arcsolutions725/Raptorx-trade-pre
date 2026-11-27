/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GeckoTerminal public API (keyless, CORS open, ~30 calls / minute per visitor) for the token page:
 * the pool's candles, its recent trades and the token's pools. Called from the browser, so the rate
 * limit is each visitor's own. https://www.geckoterminal.com/dex-api
 */

const GT_BASE = "https://api.geckoterminal.com/api/v2";

/** DexScreener chain slugs (lib/api/dexscreener.ts DEX_CHAIN_SLUG) → GeckoTerminal network ids. */
const GT_NETWORK: Record<string, string> = {
  solana: "solana",
  base: "base",
  ethereum: "eth",
  bsc: "bsc",
  monad: "monad",
  robinhood: "robinhood",
};

export function gtNetwork(dexChainSlug: string | null | undefined): string | undefined {
  return dexChainSlug ? GT_NETWORK[dexChainSlug.trim().toLowerCase()] : undefined;
}

/** The pool's page on GeckoTerminal (the "Data by GeckoTerminal" link). */
export function gtPoolUrl(network: string, pool: string): string {
  return `https://www.geckoterminal.com/${network}/pools/${pool}`;
}

/** Solana addresses are case-sensitive; EVM ones are not. */
const sameAddress = (a: string, b: string) =>
  a.startsWith("0x") ? a.toLowerCase() === b.toLowerCase() : a === b;

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : NaN;
};

async function gtGet(path: string, signal?: AbortSignal): Promise<any> {
  const r = await fetch(`${GT_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`);
  return r.json();
}

export type Candle = {
  /** candle open, unix seconds */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** volume in USD */
  v: number;
};

/** USD candles for `token` in `pool`, oldest first. */
export async function fetchPoolCandles(
  network: string,
  pool: string,
  token: string,
  opts: { minutes: 1 | 5 | 15; limit?: number },
  signal?: AbortSignal,
): Promise<Candle[]> {
  const q = new URLSearchParams({
    aggregate: String(opts.minutes),
    limit: String(opts.limit ?? 300),
    currency: "usd",
    token,
  });
  const j = await gtGet(
    `/networks/${network}/pools/${encodeURIComponent(pool)}/ohlcv/minute?${q}`,
    signal,
  );
  const list: unknown[] = j?.data?.attributes?.ohlcv_list ?? [];
  const out: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row)) continue;
    const [t, o, h, l, c, v] = row.map(num);
    if (![t, o, h, l, c].every((x) => Number.isFinite(x) && x >= 0) || !(h > 0)) continue;
    out.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  }
  return out.sort((a, b) => a.t - b.t);
}

export type PoolTrade = {
  id: string;
  /** ms */
  at: number;
  /** buy / sell of the page's token (not the pool's base) */
  side: "buy" | "sell";
  usd: number;
  /** amount of the page's token */
  amount: number;
  /** USD price of the page's token in this trade */
  price: number;
  trader: string;
  tx: string;
};

/** The pool's latest trades (last 24h, newest first), seen from `token`'s side. */
export async function fetchPoolTrades(
  network: string,
  pool: string,
  token: string,
  signal?: AbortSignal,
): Promise<PoolTrade[]> {
  const j = await gtGet(
    `/networks/${network}/pools/${encodeURIComponent(pool)}/trades`,
    signal,
  );
  const rows: any[] = Array.isArray(j?.data) ? j.data : [];
  const out: PoolTrade[] = [];
  for (const r of rows) {
    const a = r?.attributes ?? {};
    const from = String(a.from_token_address ?? "");
    const to = String(a.to_token_address ?? "");
    const buy = to && sameAddress(to, token);
    const sell = from && sameAddress(from, token);
    if (!buy && !sell) continue;
    const at = Date.parse(String(a.block_timestamp ?? ""));
    const usd = num(a.volume_in_usd);
    const amount = num(buy ? a.to_token_amount : a.from_token_amount);
    const price = num(buy ? a.price_to_in_usd : a.price_from_in_usd);
    if (!Number.isFinite(at) || !Number.isFinite(usd)) continue;
    out.push({
      id: String(r?.id ?? `${a.tx_hash}-${out.length}`),
      at,
      side: buy ? "buy" : "sell",
      usd,
      amount,
      price,
      trader: String(a.tx_from_address ?? ""),
      tx: String(a.tx_hash ?? ""),
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

export type TokenPool = {
  address: string;
  /** "WETH / USDC 0.3%" */
  name: string;
  dex: string;
  liquidityUsd: number;
  volume24h: number;
};

/** The token's pools, GeckoTerminal's order (most active first). */
export async function fetchTokenPools(
  network: string,
  token: string,
  signal?: AbortSignal,
): Promise<TokenPool[]> {
  const j = await gtGet(
    `/networks/${network}/tokens/${encodeURIComponent(token)}/pools?include=dex&page=1`,
    signal,
  );
  const dexNames = new Map<string, string>();
  for (const inc of Array.isArray(j?.included) ? j.included : []) {
    if (inc?.type === "dex" && inc?.id) dexNames.set(String(inc.id), String(inc.attributes?.name ?? inc.id));
  }
  const rows: any[] = Array.isArray(j?.data) ? j.data : [];
  return rows.map((r) => {
    const a = r?.attributes ?? {};
    const dexId = String(r?.relationships?.dex?.data?.id ?? "");
    return {
      address: String(a.address ?? ""),
      name: String(a.name ?? ""),
      dex: dexNames.get(dexId) ?? dexId,
      liquidityUsd: num(a.reserve_in_usd),
      volume24h: num(a.volume_usd?.h24),
    };
  });
}
