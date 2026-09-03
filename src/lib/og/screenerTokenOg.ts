import {
  dexScreenerTokenImageUrl,
  toDexChainSlug,
} from "@/lib/api/dexscreener";
import {
  isEvmContractAddress,
  isSolanaMintAddress,
  slugToChain,
  type ScreenerChainSlug,
} from "@/lib/rexscreenerRoutes";
import type { Chain } from "@/hooks/useTrendingTokens";

export type ScreenerTokenOgData = {
  chain: Chain;
  chainSlug: string;
  chainLabel: string;
  address: string;
  symbol: string;
  name: string;
  logoUrl?: string;
  priceUsd?: number;
  marketCap?: number;
};

const CHAIN_LABEL: Record<string, string> = {
  solana: "Solana",
  bsc: "BNB Chain",
  base: "Base",
  ethereum: "Ethereum",
  monad: "Monad",
  robinhood: "Robinhood Chain",
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Wrapped natives: DexScreener has price but almost never circulating mcap/fdv. */
const NATIVE_COINGECKO_IDS: Record<string, string> = {
  so11111111111111111111111111111111111111112: "solana",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "ethereum",
  "0x4200000000000000000000000000000000000006": "ethereum",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "binancecoin",
};

async function fetchNativeMarketCap(address: string): Promise<number | undefined> {
  const id = NATIVE_COINGECKO_IDS[address.toLowerCase()];
  if (!id) return undefined;
  const j = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_market_cap=true`,
  );
  return num(j?.[id]?.usd_market_cap);
}

function chainLabel(chain: Chain): string {
  return CHAIN_LABEL[chain] || chain;
}

function looksLikeAddress(chain: Chain, slug: string): boolean {
  const s = slug.trim();
  if (chain === "solana") return isSolanaMintAddress(s);
  return isEvmContractAddress(s);
}

function bestPair(pairs: any[], address: string): any | null {
  const wanted = address.toLowerCase();
  let best: any = null;
  let bestLiq = -1;
  for (const p of pairs) {
    const base = String(p?.baseToken?.address ?? "").toLowerCase();
    if (base && base !== wanted) continue;
    const liq = num(p?.liquidity?.usd) ?? 0;
    if (!best || liq > bestLiq) {
      best = p;
      bestLiq = liq;
    }
  }
  return best;
}

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchScreenerTokenOgData(
  chainSlug: string,
  tokenSlug: string,
): Promise<ScreenerTokenOgData | null> {
  const chain = slugToChain(chainSlug);
  if (!chain) return null;
  const address = decodeURIComponent(tokenSlug || "").trim();
  if (!address) return null;

  const slug = chainSlug.toLowerCase() as ScreenerChainSlug;
  const fallback: ScreenerTokenOgData = {
    chain,
    chainSlug: slug,
    chainLabel: chainLabel(chain),
    address,
    symbol: looksLikeAddress(chain, address)
      ? address.slice(0, 6).toUpperCase()
      : address.replace(/-/g, "").slice(0, 12).toUpperCase(),
    name: "RexScreener",
    logoUrl: looksLikeAddress(chain, address)
      ? dexScreenerTokenImageUrl(chain, address)
      : undefined,
  };

  if (!looksLikeAddress(chain, address)) return fallback;

  const dsSlug = toDexChainSlug(chain);
  const addrParam = address.startsWith("0x") ? address.toLowerCase() : address;
  let pairs: any[] = [];

  if (dsSlug) {
    const j = await fetchJson(
      `https://api.dexscreener.com/tokens/v1/${dsSlug}/${encodeURIComponent(addrParam)}`,
    );
    pairs = Array.isArray(j) ? j : j?.pairs ?? [];
  }
  if (!pairs.length) {
    const j = await fetchJson(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(addrParam)}`,
    );
    const all = Array.isArray(j?.pairs) ? j.pairs : [];
    pairs = dsSlug
      ? all.filter(
          (p: any) =>
            String(p?.chainId || "").toLowerCase() === dsSlug.toLowerCase(),
        )
      : all;
  }

  const pair = bestPair(pairs, addrParam);
  if (!pair) return fallback;

  const symbol =
    String(pair?.baseToken?.symbol || "").trim() || fallback.symbol;
  const name = String(pair?.baseToken?.name || "").trim() || symbol;
  const logo =
    (typeof pair?.info?.imageUrl === "string" && pair.info.imageUrl.trim()) ||
    dexScreenerTokenImageUrl(chain, addrParam);

  const marketCap =
    num(pair?.marketCap) ??
    num(pair?.fdv) ??
    (await fetchNativeMarketCap(addrParam));

  return {
    ...fallback,
    symbol,
    name,
    logoUrl: logo,
    priceUsd: num(pair?.priceUsd),
    marketCap,
  };
}

export function formatOgUsd(n?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (a >= 1) return `$${n.toFixed(2)}`;
  if (a >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

function firstHeaderValue(value?: string | null): string {
  return (value || "").split(",")[0]?.trim() || "";
}

/**
 * Origin used for og:image / og:url. Prefer the incoming Host so preview
 * deployments do not advertise production `/api/og/token` (which 404s until
 * that route is live on prod). Env URL is only a last-resort fallback.
 */
export function getOgSiteUrl(host?: string | null, proto?: string | null): string {
  const rawHost = firstHeaderValue(host);
  if (rawHost) {
    const protocol = firstHeaderValue(proto) || "https";
    return `${protocol}://${rawHost}`.replace(/\/$/, "");
  }
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  return "https://raptorx.trade";
}
