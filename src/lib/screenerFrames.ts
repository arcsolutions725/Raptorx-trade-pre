/**
 * RexScreener timeframes (design/screener.html #frames: 5m · 1h · 6h · 24h).
 *
 * 24h keeps the list's own figures (Birdeye's 24h price change and its all-pool 24h volume).
 * 5m / 1h / 6h come from the DexScreener pair the row's market cap and price are read from
 * (lib/dexscreenerMarketData.ts → `dexWindows`): DexScreener reports exactly these windows.
 */

import type { TrendingToken } from "@/hooks/useTrendingTokens";
import {
  pct24h,
  pickVolume24h,
} from "@/app/(rexscreener)/_components/trendingtable/tablecontent/tokenMeta";

export type ScreenerFrame = "5m" | "1h" | "6h" | "24h";

export const SCREENER_FRAMES: ScreenerFrame[] = ["5m", "1h", "6h", "24h"];

export const DEFAULT_SCREENER_FRAME: ScreenerFrame = "24h";

/** Price change % over the window, or undefined when the row has no figure for it. */
export function frameChange(
  t: Pick<TrendingToken, "pricePercentChange" | "dexWindows">,
  frame: ScreenerFrame,
): number | undefined {
  if (frame === "24h") {
    return pct24h(t.pricePercentChange) ?? t.dexWindows?.priceChange?.["24h"];
  }
  const v = t.dexWindows?.priceChange?.[frame];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** USD volume over the window, or undefined when the row has no figure for it. */
export function frameVolume(
  t: Pick<TrendingToken, "totalVolume" | "dexWindows">,
  frame: ScreenerFrame,
): number | undefined {
  if (frame === "24h") {
    return pickVolume24h(t.totalVolume) ?? t.dexWindows?.volume?.["24h"];
  }
  const v = t.dexWindows?.volume?.[frame];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Sort rows by the window's change or volume (rows without the figure go last), and renumber the
 * ranks from `rankStart`. Other fields are sorted by useTrendingTokens already.
 */
export function sortRowsByFrame<T extends TrendingToken>(
  rows: T[],
  field: "change" | "volume",
  dir: "asc" | "desc",
  frame: ScreenerFrame,
  rankStart: number,
): T[] {
  const metric = field === "change" ? frameChange : frameVolume;
  return [...rows]
    .sort((a, b) => {
      const A = metric(a, frame);
      const B = metric(b, frame);
      if (A == null && B == null) return 0;
      if (A == null) return 1;
      if (B == null) return -1;
      return dir === "asc" ? A - B : B - A;
    })
    .map((row, i) => ({ ...row, _rank: rankStart + i }));
}

/** DexScreener dex id → name for the chart head ("aerodrome" → "Aerodrome", "uniswap-v3" → "Uniswap V3"). */
const DEX_NAMES: Record<string, string> = {
  pancakeswap: "PancakeSwap",
  sushiswap: "SushiSwap",
  traderjoe: "Trader Joe",
  pumpswap: "PumpSwap",
  pumpfun: "Pump.fun",
  baseswap: "BaseSwap",
  quickswap: "QuickSwap",
  uniswap: "Uniswap",
  raydium: "Raydium",
  meteora: "Meteora",
  orca: "Orca",
  aerodrome: "Aerodrome",
};

export function dexDisplayName(dexId: string | null | undefined): string | null {
  const id = String(dexId ?? "").trim().toLowerCase();
  if (!id) return null;
  if (DEX_NAMES[id]) return DEX_NAMES[id];
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => DEX_NAMES[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
