/** Token price formatting for the chart and the trades table (prices from $90,000 to $0.000000012). */

const SUB = "₀₁₂₃₄₅₆₇₈₉";

/** "0.000001234" → "0.0₅1234" (long zero runs as a subscript count, like DexScreener). */
function compactZeros(s: string): string {
  const m = /^(-?)0\.(0{4,})(\d+)$/.exec(s);
  if (!m) return s;
  const n = String(m[2].length)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("");
  return `${m[1]}0.0${n}${m[3]}`;
}

/** A price at `d` decimals (at most 2 from 1,000), thousands separated, zero runs compacted. */
export function formatPriceFixed(v: number, d: number): string {
  if (!Number.isFinite(v)) return "–";
  if (Math.abs(v) >= 1000) {
    const k = Math.min(d, 2);
    return v.toLocaleString("en-US", { minimumFractionDigits: k, maximumFractionDigits: k });
  }
  return compactZeros(v.toFixed(Math.max(0, Math.min(d, 20))));
}

/** Decimals for about four significant digits (2 from 1,000, 4 from 1). */
export function priceDecimals(v: number): number {
  const a = Math.abs(v);
  if (!Number.isFinite(a) || a === 0) return 2;
  if (a >= 1000) return 2;
  if (a >= 1) return 4;
  return Math.min(20, Math.floor(-Math.log10(a)) + 4);
}

/**
 * Price-axis label: at most `d` decimals (the token's precision), no more digits than the value
 * needs, and no trailing zeros under 1 ("0.0018", not "0.001800000").
 */
export function formatAxisPrice(v: number, d: number): string {
  const s = formatPriceFixed(v, Math.min(d, priceDecimals(v)));
  if (!s.includes(".")) return s;
  // from 1: keep cents ("72.50", not "72.5000"); under 1: only the digits that matter
  if (Math.abs(v) >= 1) return s.replace(/(\.\d\d\d*?)0+$/, "$1");
  return s.replace(/0+$/, "").replace(/\.$/, ".0");
}

/** A price to about four significant digits. */
export function formatPrice(v: number): string {
  return formatPriceFixed(v, priceDecimals(v));
}
