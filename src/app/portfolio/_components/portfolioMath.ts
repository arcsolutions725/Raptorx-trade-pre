import {
  NATIVE_TOKEN_KEY,
  type PortfolioLedgerEntry,
  type PortfolioRange,
  type PortfolioResponse,
  type PortfolioToken,
  type PricePoint,
} from "@/lib/portfolio/types";

/** "all", or one lowercase wallet address */
export type WalletScope = string;
export const ALL_WALLETS = "all";

export type HoldingRow = {
  token: PortfolioToken;
  amount: number;
  /** wallets (lowercase) holding it, within the current scope */
  wallets: string[];
  value: number | null;
  /** Average cost per unit from RaptorX swaps; null when the token wasn't bought on RaptorX */
  avgCost: number | null;
  /** value − avgCost × amount */
  pnl: number | null;
  pnlPct: number | null;
};

export type Totals = {
  value: number;
  day: number;
  dayPct: number | null;
  /** cost of what's held, for rows with a known average cost */
  costKnown: number;
  unrealized: number | null;
  realized: number | null;
  total: number | null;
  totalPct: number | null;
  hasLedger: boolean;
};

const ledgerFor = (data: PortfolioResponse, scope: WalletScope) =>
  data.ledger[scope === ALL_WALLETS ? "*" : scope] ?? {};

export function holdingRows(data: PortfolioResponse, scope: WalletScope): HoldingRow[] {
  const ledger = ledgerFor(data, scope);
  const byToken = new Map<string, { amount: number; wallets: string[] }>();
  for (const b of data.balances) {
    if (scope !== ALL_WALLETS && b.wallet !== scope) continue;
    const cur = byToken.get(b.token) ?? { amount: 0, wallets: [] };
    cur.amount += b.amount;
    if (!cur.wallets.includes(b.wallet)) cur.wallets.push(b.wallet);
    byToken.set(b.token, cur);
  }
  const rows: HoldingRow[] = [];
  for (const [key, { amount, wallets }] of byToken) {
    const token = data.tokens[key];
    if (!token) continue;
    const value = token.priceUsd != null ? amount * token.priceUsd : null;
    const e: PortfolioLedgerEntry | undefined = ledger[key];
    const avgCost = e && e.units > 0 && e.costUsd > 0 ? e.costUsd / e.units : null;
    const pnl = avgCost != null && value != null ? value - avgCost * amount : null;
    const pnlPct = avgCost != null && token.priceUsd != null ? (token.priceUsd / avgCost - 1) * 100 : null;
    rows.push({ token, amount, wallets, value, avgCost, pnl, pnlPct });
  }
  return rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

export function totalsOf(data: PortfolioResponse, scope: WalletScope, rows: HoldingRow[]): Totals {
  const value = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const day = rows.reduce((a, r) => {
    const c = r.token.change24h;
    if (r.value == null || c == null || c <= -100) return a;
    return a + (r.value - r.value / (1 + c / 100));
  }, 0);
  const ledger = ledgerFor(data, scope);
  const hasLedger = Object.keys(ledger).length > 0;
  const known = rows.filter((r) => r.avgCost != null && r.pnl != null);
  const costKnown = known.reduce((a, r) => a + (r.avgCost as number) * r.amount, 0);
  const unrealized = known.length ? known.reduce((a, r) => a + (r.pnl as number), 0) : null;
  const realized = hasLedger ? Object.values(ledger).reduce((a, e) => a + e.realizedUsd, 0) : null;
  const total = unrealized != null || realized != null ? (unrealized ?? 0) + (realized ?? 0) : null;
  return {
    value,
    day,
    dayPct: value - day > 0 ? (day / (value - day)) * 100 : null,
    costKnown,
    unrealized,
    realized,
    total,
    totalPct: total != null && costKnown > 0 ? (total / costKnown) * 100 : null,
    hasLedger,
  };
}

/* ---------------- value over time ---------------- */

export const RANGE_SPAN: Record<PortfolioRange, number> = {
  "24H": 86400,
  "7D": 7 * 86400,
  "30D": 30 * 86400,
  "90D": 90 * 86400,
  ALL: 365 * 86400,
};
const RANGE_POINTS: Record<PortfolioRange, number> = { "24H": 96, "7D": 84, "30D": 90, "90D": 90, ALL: 120 };

/** Price at time t: the last close at or before t, else the first close (series starts later). */
function priceAt(series: PricePoint[], t: number): number {
  let lo = 0;
  let hi = series.length - 1;
  if (t < series[0][0]) return series[0][1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return series[lo][1];
}

export type SeriesPoint = { t: number; v: number };

/**
 * Value of the given holdings over the range (today's amounts × each token's price at the time).
 * The last point uses live prices, so it equals the header total.
 */
export function valueSeries(
  rows: { token: PortfolioToken; amount: number }[],
  history: Record<string, PricePoint[]> | undefined,
  range: PortfolioRange,
  nowSec: number,
): SeriesPoint[] {
  const n = RANGE_POINTS[range];
  const start = nowSec - RANGE_SPAN[range];
  const step = (nowSec - start) / (n - 1);
  const priced = rows.filter((r) => r.token.priceUsd != null);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i === n - 1 ? nowSec : start + i * step;
    let v = 0;
    for (const r of priced) {
      const s = history?.[r.token.key];
      const p = i === n - 1 || r.token.stable || !s?.length ? (r.token.priceUsd as number) : priceAt(s, t);
      v += r.amount * p;
    }
    out.push({ t, v });
  }
  return out;
}

/** Tokens to ask /api/portfolio/history for: "<key>:<pool>:<priced contract>" */
export function historyPools(tokens: PortfolioToken[]): string[] {
  return tokens
    .filter((t) => t.pool && !t.stable)
    .map((t) => `${t.key}:${t.pool}:${t.key === NATIVE_TOKEN_KEY ? "0x4200000000000000000000000000000000000006" : t.key}`)
    .sort();
}

/* ---------------- formatting (design/js/portfolio.js) ---------------- */

export const fmt = (n: number, d = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const usd = (n: number) => (n < 0 ? "-$" : "$") + fmt(Math.abs(n), Math.abs(n) < 1 && n !== 0 ? 4 : 2);
const sgn = (n: number) => (n >= 0 ? "+" : "-");
export const pnlUsd = (n: number) => sgn(n) + "$" + fmt(Math.abs(n));
export const pct = (n: number) => sgn(n) + fmt(Math.abs(n)) + "%";
export const priceFmt = (n: number) =>
  "$" + (n >= 1 ? fmt(n, 2) : n > 0 ? n.toPrecision(3) : "0.00");
export const amtFmt = (n: number) => (n >= 1000 ? fmt(n, 0) : n >= 1 ? fmt(n, 2) : n > 0 ? fmt(n, 4) : "0");

export function tickLabel(range: PortfolioRange, tSec: number): string {
  const d = new Date(tSec * 1000);
  return range === "24H"
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: range === "ALL" ? "numeric" : undefined });
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Same-origin copy of a remote logo (next/image), so canvas exports stay untainted. */
export const proxiedImage = (url: string, w = 128) => `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
