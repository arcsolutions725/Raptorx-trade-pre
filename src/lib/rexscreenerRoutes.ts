import type { Chain, TrendingToken } from "@/hooks/useTrendingTokens";

/** URL path segments for RexScreener chains (BNB uses `bnb`, internal chain is `bsc`). */
export const SCREENER_CHAIN_SLUGS = [
  "monad",
  "base",
  "solana",
  "bnb",
  "ethereum",
] as const;

export type ScreenerChainSlug = (typeof SCREENER_CHAIN_SLUGS)[number];

export function isScreenerChainSlug(s: string): s is ScreenerChainSlug {
  return (SCREENER_CHAIN_SLUGS as readonly string[]).includes(
    s.toLowerCase() as ScreenerChainSlug
  );
}

/** Map URL slug → app `Chain` (API body). */
export function slugToChain(slug: string): Chain | null {
  const k = slug.toLowerCase();
  if (!isScreenerChainSlug(k)) return null;
  if (k === "bnb") return "bsc";
  return k as Chain;
}

/** RexScreener default landing: Solana trending (`/` redirects here). */
export const REX_SCREENER_ALL_HREF = "/solana";

/** Map `Chain` → single URL segment (`all` uses {@link REX_SCREENER_ALL_HREF}, not a chain slug). */
export function chainToSlug(chain: Chain): string | null {
  if (chain === "all") return null;
  if (chain === "bsc") return "bnb";
  if (chain === "ethereum") return "ethereum";
  return chain;
}

export function hrefForScreenerChain(chain: Chain): string {
  const seg = chainToSlug(chain);
  return seg ? `/${seg}` : REX_SCREENER_ALL_HREF;
}

/** URL segment for a non-`all` chain tab. */
export function pathSegmentForChain(chain: Exclude<Chain, "all">): ScreenerChainSlug {
  return chainToSlug(chain) as ScreenerChainSlug;
}

/** Infer chain tab from token metadata (for `/all` list when opening a chart). */
export function chainFromToken(t: TrendingToken): Chain {
  const id = String(t.chainId ?? "").toLowerCase();
  if (id === "bsc" || id === "56") return "bsc";
  if (id === "base" || id === "8453") return "base";
  if (id === "monad" || id === "10143") return "monad";
  if (id === "ethereum" || id === "eth" || id === "1") return "ethereum";
  return "solana";
}

export function chainPathSegmentForToken(t: TrendingToken): ScreenerChainSlug {
  const c = chainFromToken(t);
  return chainToSlug(c) as ScreenerChainSlug;
}

export function tokenToUrlSlug(t: TrendingToken): string {
  const raw = (t.symbol ?? t.name ?? "token").trim();
  return slugifyTokenSegment(raw);
}

export function isEvmContractAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s.trim());
}

/** Base58 Solana mint; length 32–44. */
export function isSolanaMintAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

/**
 * Path segment for `/[chain]/[segment]`.
 * EVM: lowercase contract (stable, unambiguous). Solana: mint when available, else symbol slug.
 */
export function tokenToPathSegment(t: TrendingToken): string {
  const addr = (t.tokenAddress ?? "").trim();
  if (!addr) return tokenToUrlSlug(t);
  const c = chainFromToken(t);
  if (c === "solana") {
    if (isSolanaMintAddress(addr)) return addr;
    return tokenToUrlSlug(t);
  }
  if (isEvmContractAddress(addr)) return addr.toLowerCase();
  return tokenToUrlSlug(t);
}

/** Match URL segment to token (symbol slug or raw contract/mint). */
export function tokenMatchesPathSegment(
  t: TrendingToken,
  rawPathSlug: string,
  normalizedSymbolSlug: string
): boolean {
  const raw = rawPathSlug.trim();
  if (isEvmContractAddress(raw) && chainFromToken(t) !== "solana") {
    return (t.tokenAddress || "").toLowerCase() === raw.toLowerCase();
  }
  if (isSolanaMintAddress(raw)) {
    return (t.tokenAddress || "") === raw;
  }
  return tokenMatchesPathSlug(t, normalizedSymbolSlug);
}

export function slugifyTokenSegment(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/_/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "token"
  );
}

export function normalizeTokenPathSlug(pathSlug: string): string {
  return pathSlug.trim().toLowerCase().replace(/_/g, "-");
}

function tokenSlugCandidates(t: TrendingToken): Set<string> {
  const out = new Set<string>();
  for (const raw of [t.symbol, t.name, t.uniqueName]) {
    if (typeof raw === "string" && raw.trim()) {
      out.add(slugifyTokenSegment(raw));
    }
  }
  return out;
}

export function tokenMatchesPathSlug(
  t: TrendingToken,
  normalizedPathSlug: string
): boolean {
  if (!normalizedPathSlug) return false;
  for (const s of tokenSlugCandidates(t)) {
    if (s === normalizedPathSlug) return true;
  }
  return false;
}

export function tokenMatchesChain(t: TrendingToken, chain: Chain): boolean {
  if (chain === "all") return true;
  const id = String(t.chainId ?? "").toLowerCase();
  if (chain === "solana")
    return id === "solana" || id === "" || id === "101";
  if (chain === "bsc") return id === "bsc" || id === "56";
  if (chain === "base") return id === "base" || id === "8453";
  if (chain === "monad") return id === "monad" || id === "10143";
  if (chain === "ethereum")
    return id === "ethereum" || id === "eth" || id === "1";
  return true;
}

/** Derive screener chain + optional token slug from pathname (client). */
export function parseRexScreenerPath(pathname: string): {
  routeChain: Chain;
  routeTokenSlug: string | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return { routeChain: "all", routeTokenSlug: null };
  }
  const first = parts[0]!.toLowerCase();
  if (first === "rexscreener" && parts.length === 1) {
    return { routeChain: "solana", routeTokenSlug: null };
  }
  if (!isScreenerChainSlug(first)) {
    return { routeChain: "all", routeTokenSlug: null };
  }
  const routeChain = slugToChain(first)!;
  if (parts.length >= 2) {
    try {
      return {
        routeChain,
        routeTokenSlug: decodeURIComponent(parts[1]!),
      };
    } catch {
      return { routeChain, routeTokenSlug: parts[1]! };
    }
  }
  return { routeChain, routeTokenSlug: null };
}

/** True when pathname is RexScreener (`/rexscreener`, `/solana`, `/monad`, `/bnb/foo`, etc.). */
export function isRexScreenerPathname(pathname: string): boolean {
  if (!pathname) return false;
  const pathOnly = pathname.split("?")[0] ?? pathname;
  if (pathOnly === "/rexscreener" || pathOnly.startsWith("/rexscreener/"))
    return true;
  if (pathOnly === REX_SCREENER_ALL_HREF) return true;
  const parts = pathOnly.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length > 2) return false;
  return isScreenerChainSlug(parts[0]!.toLowerCase());
}

type MinimalAppRouter = { push: (href: string) => void };

/**
 * Soft-navigate to `/[chain]/[token]` so the address bar (and `usePathname`, via Next’s
 * patched `history.pushState`) updates in the same interaction as the chart UI — not
 * noticeably after `router.push` completes.
 */
export function pushScreenerTokenPathThenNavigate(
  router: MinimalAppRouter,
  nextPath: string
): void {
  if (typeof window !== "undefined") {
    try {
      window.history.pushState(null, "", nextPath);
    } catch {
      /* ignore */
    }
  }
  router.push(nextPath);
}
