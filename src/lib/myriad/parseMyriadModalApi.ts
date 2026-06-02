import { formatUnits } from "viem";

const WAD = BigInt(10) ** BigInt(18);

export type MyriadOrderRowParsed = {
  orderHash: string;
  marketId: number;
  outcomeId: number;
  side: 0 | 1;
  priceWei: string;
  amountWei: string;
  filledAmountWei: string;
  status: string;
  createdAt?: string;
  filledAt?: string | null;
  timeInForce?: string;
};

function readUintString(v: unknown): string {
  if (typeof v === "string" && /^\d+$/.test(v)) return v;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return String(Math.trunc(v));
  return "0";
}

function readMarketId(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return NaN;
}

/** Parse GET /orders `data[]` entries per Order Book API. */
export function parseMyriadOrdersListPayload(json: unknown): MyriadOrderRowParsed[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const arr = Array.isArray(root.data) ? root.data : Array.isArray(json) ? (json as unknown[]) : [];
  const out: MyriadOrderRowParsed[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const order = r.order && typeof r.order === "object" ? (r.order as Record<string, unknown>) : r;
    const hash = typeof r.orderHash === "string" ? r.orderHash : typeof r.hash === "string" ? r.hash : "";
    if (!hash.startsWith("0x")) continue;
    const marketId = readMarketId(order.marketId);
    if (!Number.isFinite(marketId)) continue;
    const outcomeId = typeof order.outcomeId === "number" ? order.outcomeId : Number(order.outcomeId);
    const side = order.side === 1 || order.side === "1" ? 1 : 0;
    out.push({
      orderHash: hash,
      marketId,
      outcomeId: Number.isFinite(outcomeId) ? Math.trunc(outcomeId) : 0,
      side: side as 0 | 1,
      priceWei: readUintString(order.price),
      amountWei: readUintString(order.amount),
      filledAmountWei: readUintString(r.filledAmount),
      status: typeof r.status === "string" ? r.status : "unknown",
      createdAt: typeof r.createdAt === "string" ? r.createdAt : undefined,
      filledAt: r.filledAt === null ? null : typeof r.filledAt === "string" ? r.filledAt : undefined,
      timeInForce: typeof r.timeInForce === "string" ? r.timeInForce : undefined,
    });
  }
  return out;
}

export function myriadPriceWeiToDecimal(priceWei: string): number {
  try {
    const x = BigInt(priceWei);
    if (x <= BigInt(0)) return 0;
    return Number(x) / Number(WAD);
  } catch {
    return 0;
  }
}

export function myriadShareWeiToNumber(wei: string, decimals = 18): number {
  try {
    return Number(formatUnits(BigInt(wei), decimals));
  } catch {
    return 0;
  }
}

export type MyriadUserMarketPositionRow = {
  marketId: number;
  slug: string;
  title: string;
  state: string;
  yesShares: number;
  noShares: number;
  /** Suggest showing Redeem (resolved/closed or API flag); on-chain tx may still revert if not ready. */
  redeemEligible: boolean;
};

/** GET /users/:address/events row (AMM + on-chain activity). */
export type MyriadUserEventRowParsed = {
  action: string;
  marketTitle: string;
  marketSlug: string;
  marketId: number;
  networkId: number;
  outcomeTitle: string;
  outcomeId: number;
  shares: number;
  value: number;
  timestamp: number;
  blockNumber: number;
};

function numOr0(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function readTimestamp(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return 0;
}

/** Parse GET /users/:address/events `data[]`. */
export function parseMyriadUserEventsPayload(json: unknown): MyriadUserEventRowParsed[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const arr = Array.isArray(root.data) ? root.data : [];
  const out: MyriadUserEventRowParsed[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const action = typeof r.action === "string" ? r.action : "";
    if (!action) continue;
    const marketId = readMarketId(r.marketId ?? r.market_id);
    if (!Number.isFinite(marketId)) continue;
    const networkId = readMarketId(r.networkId ?? r.network_id);
    const nid = Number.isFinite(networkId) ? networkId : 0;
    const oidRaw = r.outcomeId ?? r.outcome_id;
    const outcomeId =
      typeof oidRaw === "number" && Number.isFinite(oidRaw)
        ? Math.trunc(oidRaw)
        : typeof oidRaw === "string"
          ? parseInt(oidRaw, 10)
          : 0;
    out.push({
      action,
      marketTitle: String(r.marketTitle ?? r.market_title ?? "").trim(),
      marketSlug: String(r.marketSlug ?? r.market_slug ?? "").trim(),
      marketId,
      networkId: nid,
      outcomeTitle: String(r.outcomeTitle ?? r.outcome_title ?? "").trim(),
      outcomeId: Number.isFinite(outcomeId) ? outcomeId : 0,
      shares: numOr0(r.shares),
      value: numOr0(r.value),
      timestamp: readTimestamp(r.timestamp),
      blockNumber: readTimestamp(r.blockNumber ?? r.block_number),
    });
  }
  return out;
}

/**
 * Normalize GET /users/:address/markets (and compatible GET /users/:address/portfolio) payloads —
 * **one row per market** for positions + claim UI.
 *
 * Per Myriad API docs, `GET /users/:address/markets` returns items shaped like:
 * `{ market, portfolio: { positions: [...], liquidity: {...} } }` — shares live under
 * `portfolio.positions`, not top-level `positions`.
 */
export function parseMyriadUserMarketsPayload(json: unknown): MyriadUserMarketPositionRow[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const rawList = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.markets)
      ? root.markets
      : Array.isArray(root.items)
        ? root.items
        : [];

  const byId = new Map<
    number,
    { slug: string; title: string; state: string; yes: number; no: number; redeemEligible: boolean }
  >();

  const merge = (
    marketId: number,
    slug: string,
    title: string,
    state: string,
    yes: number,
    no: number,
    redeemEligible: boolean
  ) => {
    if (!Number.isFinite(marketId) || marketId <= 0) return;
    const prev = byId.get(marketId);
    const slugF = slug || prev?.slug || "";
    const titleF = title || prev?.title || slugF || `Market #${marketId}`;
    const stateF = state || prev?.state || "";
    byId.set(marketId, {
      slug: slugF,
      title: titleF,
      state: stateF,
      yes: (prev?.yes ?? 0) + yes,
      no: (prev?.no ?? 0) + no,
      redeemEligible: Boolean(prev?.redeemEligible || redeemEligible),
    });
  };

  const addFromPositionRow = (
    pr: Record<string, unknown>,
    yesShares: { v: number },
    noShares: { v: number },
    redeemFlag: { v: boolean }
  ) => {
    const oid = pr.outcomeId ?? pr.outcome_id ?? pr.outcomeIndex;
    const sh = numOr0(pr.shares ?? pr.balance ?? pr.amount);
    if (oid === 1 || oid === "1") noShares.v += sh;
    else if (oid === 0 || oid === "0") yesShares.v += sh;
    else if (sh > 0) {
      const title = String(pr.outcomeTitle ?? pr.outcome_title ?? "").toLowerCase();
      if (title === "no" || title.startsWith("no ")) noShares.v += sh;
      else yesShares.v += sh;
    }
    if (pr.winningsToClaim === true || pr.voidedWinningsToClaim === true) redeemFlag.v = true;
  };

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const m = o.market && typeof o.market === "object" ? (o.market as Record<string, unknown>) : o;

    let marketId = readMarketId(
      m.chainMarketId ?? m.marketId ?? m.id ?? o.marketId ?? o.chainMarketId
    );
    const slug = String(
      m.slug ?? o.slug ?? o.marketSlug ?? o.market_slug ?? ""
    ).trim();
    const title = String(
      m.title ?? m.question ?? o.title ?? o.marketTitle ?? o.market_title ?? ""
    ).trim();
    const stateRaw = String(m.state ?? m.status ?? o.state ?? "").toLowerCase();

    let yesShares = numOr0(o.yesShares ?? o.yes_shares ?? o.yesBalance ?? m.yesShares);
    let noShares = numOr0(o.noShares ?? o.no_shares ?? o.noBalance ?? m.noShares);

    const portfolio =
      o.portfolio && typeof o.portfolio === "object"
        ? (o.portfolio as Record<string, unknown>)
        : null;
    const nestedPositions: unknown[] =
      portfolio && Array.isArray(portfolio.positions) ? portfolio.positions : [];
    const topPositions = Array.isArray(o.positions) ? o.positions : [];
    const outcomes = Array.isArray(o.outcomes) ? o.outcomes : [];

    const positionRows: unknown[] =
      nestedPositions.length > 0
        ? nestedPositions
        : [...topPositions, ...outcomes];

    const yesAcc = { v: yesShares };
    const noAcc = { v: noShares };
    const redeemFromPositions = { v: false };

    for (const p of positionRows) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      const pid = readMarketId(pr.marketId ?? pr.market_id);
      if (Number.isFinite(pid) && pid > 0 && (!Number.isFinite(marketId) || marketId <= 0)) {
        marketId = pid;
      }
      addFromPositionRow(pr, yesAcc, noAcc, redeemFromPositions);
    }

    yesShares = yesAcc.v;
    noShares = noAcc.v;

    const singleShares = numOr0(o.shares ?? o.balance);
    const looksLikeFlatPortfolioRow =
      positionRows.length === 0 &&
      singleShares > 0 &&
      (o.outcomeId != null || o.outcome_id != null) &&
      Number.isFinite(readMarketId(o.marketId ?? o.market_id));

    if (looksLikeFlatPortfolioRow) {
      const oid = o.outcomeId ?? o.outcome_id;
      if (oid === 1 || oid === "1") noShares = singleShares;
      else yesShares = singleShares;
      if (!Number.isFinite(marketId) || marketId <= 0) {
        marketId = readMarketId(o.marketId ?? o.market_id);
      }
      if (o.winningsToClaim === true || o.voidedWinningsToClaim === true) {
        redeemFromPositions.v = true;
      }
    }

    const redeemEligible =
      redeemFromPositions.v ||
      o.redeemable === true ||
      m.redeemable === true ||
      o.canRedeem === true ||
      stateRaw === "resolved" ||
      stateRaw === "closed" ||
      stateRaw === "finalized";

    merge(marketId, slug, title, stateRaw, yesShares, noShares, redeemEligible);
  }

  const rows: MyriadUserMarketPositionRow[] = [];
  for (const [marketId, v] of byId) {
    if (v.yes <= 0 && v.no <= 0) continue;
    rows.push({
      marketId,
      slug: v.slug || String(marketId),
      title: v.title,
      state: v.state,
      yesShares: v.yes,
      noShares: v.no,
      redeemEligible: v.redeemEligible,
    });
  }
  rows.sort((a, b) => b.marketId - a.marketId);
  return rows;
}
