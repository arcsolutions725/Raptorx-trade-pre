import type { TrendingToken } from "@/hooks/useTrendingTokens";
import { chainFromToken } from "@/lib/rexscreenerRoutes";

/** Align DB `GoldenReportProject.chain` with canonical segments (internal API + trending). */
export function normGoldenDbChain(chain: string): string {
  const t = (chain || "solana").trim().toLowerCase();
  if (t === "56" || t === "bnb") return "bsc";
  if (t === "1" || t === "eth") return "ethereum";
  if (
    t === "solana" ||
    t === "bsc" ||
    t === "base" ||
    t === "monad" ||
    t === "ethereum"
  ) {
    return t;
  }
  return "solana";
}

export function normGoldenContractAddress(contractAddress: string): string {
  const a = contractAddress.trim();
  if (/^0x[a-fA-F0-9]{40}$/i.test(a)) return a.toLowerCase();
  return a;
}

/** Stable registry key for DB row or RexScreener trending/search row. */
export function goldenRegistryKey(
  chain: string,
  contractAddress: string,
): string {
  return `${normGoldenDbChain(chain)}:${normGoldenContractAddress(contractAddress)}`;
}

export function goldenRegistryKeyFromTrendingToken(
  t: TrendingToken,
): string | null {
  const addr = (t.tokenAddress ?? "").trim();
  if (!addr) return null;
  const c = chainFromToken(t);
  if (c === "all") return null;
  return goldenRegistryKey(c, addr);
}
