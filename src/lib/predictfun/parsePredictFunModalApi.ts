/* eslint-disable @typescript-eslint/no-explicit-any */
import { utils } from "ethers";
import { addressesEqual, normalizePredictFunAddress } from "@/lib/predictfun/userAddress";
import {
  extractPredictFunPositionsList,
  predictFunPositionShares,
} from "@/lib/predictfun/parsePredictFunPositions";
import {
  parsePredictFunPositionRedeemParams,
  predictFunPositionRedeemEligible,
  shouldShowPredictFunPositionInList,
  type PredictFunPositionRedeemParams,
} from "@/lib/predictfun/parsePredictFunRedeem";

export type PredictFunModalTradeRow = {
  key: string;
  marketId: string;
  marketTitle: string;
  slugForLink: string;
  sideLabel: string;
  sideTone: "buy" | "sell" | "neutral";
  priceDisplay: string;
  sizeDisplay: string;
  role: string;
  statusLabel: string;
  statusStyle: "open" | "confirmed" | "cancelled" | "pending" | "other";
  timeStr: string;
  sortTime: number;
};

export type PredictFunModalPositionRow = {
  key: string;
  marketId: string;
  marketTitle: string;
  slugForLink: string;
  outcome: string;
  shares: number;
  sharesDisplay: string;
  usdtBalanceDisplay?: string;
  redeemEligible?: boolean;
  redeemParams?: PredictFunPositionRedeemParams | null;
};

function extractArray(body: unknown): any[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.data)) return b.data as any[];
  const nested = b.data as Record<string, unknown> | undefined;
  if (nested && Array.isArray(nested.data)) return nested.data as any[];
  if (nested && Array.isArray(nested.positions)) return nested.positions as any[];
  if (nested && Array.isArray(nested.items)) return nested.items as any[];
  if (nested && Array.isArray(nested.results)) return nested.results as any[];
  if (Array.isArray(b.items)) return b.items as any[];
  if (Array.isArray(b.results)) return b.results as any[];
  if (Array.isArray(b.orders)) return b.orders as any[];
  if (Array.isArray(b.matches)) return b.matches as any[];
  if (Array.isArray(b.positions)) return b.positions as any[];
  return [];
}

export function extractPredictFunList(body: unknown): any[] {
  return extractArray(body);
}

function weiToNumber(v: unknown, decimals = 18): number {
  if (v == null) return 0;
  try {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).trim();
    if (!s) return 0;
    if (/^\d+$/.test(s)) return Number(utils.formatUnits(s, decimals));
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function parseTimestamp(raw: unknown): { sortTime: number; timeStr: string } {
  if (raw == null) return { sortTime: 0, timeStr: "—" };
  if (typeof raw === "number") {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return {
      sortTime: d.getTime(),
      timeStr: Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }),
    };
  }
  const s = String(raw).trim();
  if (!s) return { sortTime: 0, timeStr: "—" };
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return {
      sortTime: d.getTime(),
      timeStr: d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }),
    };
  }
  const d = new Date(s);
  return {
    sortTime: d.getTime(),
    timeStr: Number.isNaN(d.getTime())
      ? s
      : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }),
  };
}

function marketMeta(raw: any): {
  marketId: string;
  marketTitle: string;
  slugForLink: string;
} {
  const market = raw?.market ?? raw?.category ?? {};
  const marketId = String(
    raw?.marketId ?? raw?.market_id ?? market?.id ?? market?.marketId ?? ""
  ).trim();
  const marketTitle = String(
    raw?.marketTitle ??
      raw?.market_title ??
      market?.title ??
      market?.question ??
      raw?.title ??
      (marketId ? `Market #${marketId}` : "Market")
  ).trim();
  const slugForLink =
    String(market?.categorySlug ?? market?.slug ?? marketId).trim() || marketId;
  return { marketId, marketTitle, slugForLink };
}

function orderBelongsToUser(raw: any, userAddress: string): boolean {
  const order = raw?.order ?? raw;
  return (
    addressesEqual(order?.maker, userAddress) ||
    addressesEqual(order?.signer, userAddress) ||
    addressesEqual(raw?.maker, userAddress) ||
    addressesEqual(raw?.signer, userAddress)
  );
}

function sideFromQuoteType(
  quoteType: unknown,
  outcomeName: string
): { sideLabel: string; sideTone: "buy" | "sell" | "neutral" } {
  const qt = String(quoteType ?? "").trim().toLowerCase();
  const outcome = outcomeName.trim();
  if (qt === "bid") {
    return {
      sideLabel: outcome ? `BID ${outcome.toUpperCase()}` : "BID",
      sideTone: "buy",
    };
  }
  if (qt === "ask") {
    return {
      sideLabel: outcome ? `ASK ${outcome.toUpperCase()}` : "ASK",
      sideTone: "sell",
    };
  }
  return { sideLabel: "—", sideTone: "neutral" };
}

function sideFromOrderSide(raw: any): {
  sideLabel: string;
  sideTone: "buy" | "sell" | "neutral";
} {
  const order = raw?.order ?? raw;
  const sideNum = order?.side ?? raw?.side;
  const sideStr = String(raw?.sideName ?? raw?.side_label ?? "").toLowerCase();
  if (sideNum === 0 || sideNum === "0" || sideStr === "buy" || sideStr === "bid") {
    return { sideLabel: "BUY", sideTone: "buy" };
  }
  if (sideNum === 1 || sideNum === "1" || sideStr === "sell" || sideStr === "ask") {
    return { sideLabel: "SELL", sideTone: "sell" };
  }
  const outcome =
    raw?.outcome?.name ??
    raw?.outcomeName ??
    (typeof raw?.outcome === "string" ? raw.outcome : "");
  const name = String(outcome ?? "").trim();
  if (name) return { sideLabel: name.toUpperCase(), sideTone: "neutral" };
  return { sideLabel: "—", sideTone: "neutral" };
}

function statusFromRaw(raw: any): {
  statusLabel: string;
  statusStyle: PredictFunModalTradeRow["statusStyle"];
} {
  const s = String(
    raw?.status ?? raw?.orderStatus ?? raw?.state ?? raw?.fillStatus ?? "—"
  )
    .trim()
    .toUpperCase();
  if (!s || s === "—") return { statusLabel: "—", statusStyle: "other" };
  if (s.includes("OPEN") || s.includes("LIVE") || s.includes("ACTIVE")) {
    return { statusLabel: s, statusStyle: "open" };
  }
  if (s.includes("FILL") || s.includes("MATCH") || s.includes("EXEC") || s === "CONFIRMED") {
    return { statusLabel: s, statusStyle: "confirmed" };
  }
  if (s.includes("CANCEL")) return { statusLabel: s, statusStyle: "cancelled" };
  if (s.includes("PEND")) return { statusLabel: s, statusStyle: "pending" };
  return { statusLabel: s, statusStyle: "other" };
}

function formatPriceValue(p: unknown): string {
  if (p == null) return "—";
  if (typeof p === "number") {
    if (p > 0 && p <= 1) return `${(p * 100).toFixed(2)}¢`;
    return String(p);
  }
  const n = weiToNumber(p, 18);
  if (n > 0 && n <= 1) return `${(n * 100).toFixed(2)}¢`;
  if (n > 1 && n <= 100) return `${n.toFixed(2)}¢`;
  return n > 0 ? String(n) : "—";
}

function formatSizeValue(v: unknown): string {
  const n = typeof v === "number" ? v : weiToNumber(v, 18);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function mapOrderEntryToTradeRow(
  raw: any,
  idx: number,
  userAddress: string
): PredictFunModalTradeRow | null {
  if (!orderBelongsToUser(raw, userAddress)) return null;

  const order = raw?.order ?? raw;
  const { marketId, marketTitle, slugForLink } = marketMeta(raw);
  const { sideLabel, sideTone } = sideFromOrderSide(order);
  const { statusLabel, statusStyle } = statusFromRaw(raw);
  const { sortTime, timeStr } = parseTimestamp(
    raw?.createdAt ??
      raw?.created_at ??
      order?.createdAt ??
      raw?.updatedAt ??
      order?.updatedAt
  );

  return {
    key: String(
      raw?.id ?? order?.hash ?? order?.id ?? raw?.hash ?? `order-${idx}`
    ),
    marketId,
    marketTitle,
    slugForLink,
    sideLabel,
    sideTone,
    priceDisplay: formatPriceValue(
      raw?.pricePerShare ?? raw?.price_per_share ?? order?.pricePerShare
    ),
    sizeDisplay: formatSizeValue(
      order?.takerAmount ?? order?.makerAmount ?? raw?.takerAmount ?? raw?.makerAmount
    ),
    role: "—",
    statusLabel,
    statusStyle,
    timeStr,
    sortTime,
  };
}

/** GET /orders/matches event — expand taker + maker legs for this wallet only. */
function mapMatchEventToTradeRows(
  match: any,
  idx: number,
  userAddress: string
): PredictFunModalTradeRow[] {
  const { marketId, marketTitle, slugForLink } = marketMeta(match);
  const { sortTime, timeStr } = parseTimestamp(match?.executedAt);
  const rows: PredictFunModalTradeRow[] = [];

  const pushLeg = (leg: any, role: "TAKER" | "MAKER", legIdx: number) => {
    if (!leg || !addressesEqual(leg?.signer, userAddress)) return;
    const outcomeName = String(leg?.outcome?.name ?? "").trim();
    const { sideLabel, sideTone } = sideFromQuoteType(leg?.quoteType, outcomeName);
    rows.push({
      key: `${match?.transactionHash ?? idx}-${role}-${legIdx}`,
      marketId,
      marketTitle,
      slugForLink,
      sideLabel,
      sideTone,
      priceDisplay: formatPriceValue(leg?.price ?? match?.priceExecuted),
      sizeDisplay: formatSizeValue(leg?.amount ?? match?.amountFilled),
      role,
      statusLabel: "MATCHED",
      statusStyle: "confirmed",
      timeStr,
      sortTime,
    });
  };

  pushLeg(match?.taker, "TAKER", 0);
  const makers = Array.isArray(match?.makers) ? match.makers : [];
  makers.forEach((leg: any, i: number) => pushLeg(leg, "MAKER", i));

  return rows;
}

export function mapPredictFunPositionRow(
  raw: any,
  idx: number,
  walletAddresses?: string | string[] | null
): PredictFunModalPositionRow | null {
  const allowList = Array.isArray(walletAddresses)
    ? walletAddresses
    : walletAddresses
      ? [walletAddresses]
      : [];
  if (allowList.length > 0) {
    const owner = raw?.owner ?? raw?.holder ?? raw?.account;
    if (
      owner &&
      !allowList.some((addr) => addressesEqual(owner, addr))
    ) {
      return null;
    }
  }

  const { marketId, marketTitle, slugForLink } = marketMeta(raw);
  const outcome = String(
    raw?.outcome?.name ?? raw?.outcome ?? raw?.outcomeName ?? raw?.name ?? "—"
  ).trim();
  const shares = predictFunPositionShares(raw);
  if (shares <= 0) return null;

  const redeemParams = parsePredictFunPositionRedeemParams(raw);

  return {
    key: String(raw?.tokenId ?? raw?.id ?? `pos-${idx}`),
    marketId,
    marketTitle,
    slugForLink,
    outcome: outcome || "—",
    shares,
    sharesDisplay: shares.toLocaleString(undefined, { maximumFractionDigits: 4 }),
    redeemEligible: redeemParams ? predictFunPositionRedeemEligible(raw, raw?.market) : false,
    redeemParams,
  };
}

export type PredictFunActivityItem = {
  key: string;
  sideLabel: string;
  sideTone: "buy" | "sell" | "neutral";
  outcome: string;
  priceDisplay: string;
  sizeDisplay: string;
  timeStr: string;
  sortTime: number;
  marketTitle: string;
};

/** Public market activity row from GET /orders/matches (taker leg). */
export function mapPredictFunMatchToActivityItems(
  match: any,
  idx: number
): PredictFunActivityItem[] {
  const { marketTitle } = marketMeta(match);
  const { sortTime, timeStr } = parseTimestamp(match?.executedAt);
  const taker = match?.taker;
  if (!taker) return [];

  const outcomeName = String(taker?.outcome?.name ?? "Yes").trim();
  const { sideLabel, sideTone } = sideFromQuoteType(taker?.quoteType, outcomeName);
  const price =
    taker?.price ?? match?.priceExecuted ?? match?.price_executed ?? null;

  return [
    {
      key: String(match?.transactionHash ?? `match-${idx}`),
      sideLabel,
      sideTone,
      outcome: outcomeName || "—",
      priceDisplay: formatPriceValue(price),
      sizeDisplay: formatSizeValue(
        taker?.amount ?? match?.amountFilled ?? match?.amount_filled
      ),
      timeStr,
      sortTime,
      marketTitle,
    },
  ];
}

export function buildPredictFunUnifiedTradeRows(
  ordersBody: unknown,
  matchesBody: unknown,
  userAddress: string,
  extraRows: PredictFunModalTradeRow[] = []
): PredictFunModalTradeRow[] {
  const addr = normalizePredictFunAddress(userAddress);
  if (!addr) return [...extraRows].sort((a, b) => b.sortTime - a.sortTime);

  const orderRows = extractPredictFunList(ordersBody)
    .map((o, i) => mapOrderEntryToTradeRow(o, i, addr))
    .filter((r): r is PredictFunModalTradeRow => r != null);

  const matchRows = extractPredictFunList(matchesBody).flatMap((m, i) =>
    mapMatchEventToTradeRows(m, i, addr)
  );

  const byKey = new Map<string, PredictFunModalTradeRow>();
  for (const row of [...extraRows, ...matchRows, ...orderRows]) {
    if (!byKey.has(row.key)) byKey.set(row.key, row);
  }
  return [...byKey.values()].sort((a, b) => b.sortTime - a.sortTime);
}

export function buildPredictFunPositionRows(
  positionsBody: unknown,
  userAddress: string,
  usdtBalanceWei?: string | null,
  relatedAddresses?: string[],
  options?: {
    skipOwnerFilter?: boolean;
    hideRedeemKeys?: Set<string>;
    marketMetaById?: Map<string, Record<string, unknown>>;
  }
): PredictFunModalPositionRow[] {
  const addr = normalizePredictFunAddress(userAddress);
  if (!addr) return [];

  const allow = options?.skipOwnerFilter
    ? null
    : [
        addr,
        ...(relatedAddresses ?? [])
          .map((a) => normalizePredictFunAddress(a))
          .filter((a): a is string => !!a),
      ];

  const rows = extractPredictFunPositionsList(positionsBody)
    .filter((p) => {
      const mid = String(p?.market?.id ?? p?.marketId ?? p?.market_id ?? "").trim();
      const ctx =
        (mid && options?.marketMetaById?.get(mid)) ??
        p?.market ??
        p?.category;
      return shouldShowPredictFunPositionInList(p, ctx);
    })
    .map((p, i) => {
      const mid = String(p?.market?.id ?? p?.marketId ?? p?.market_id ?? "").trim();
      const ctx = (mid && options?.marketMetaById?.get(mid)) ?? p?.market;
      const enriched = ctx ? { ...p, market: { ...(p?.market ?? {}), ...ctx } } : p;
      return mapPredictFunPositionRow(enriched, i, allow);
    })
    .filter((r): r is PredictFunModalPositionRow => r != null)
    .filter((r) => {
      if (!options?.hideRedeemKeys?.size || !r.redeemParams) return true;
      const key = `${r.redeemParams.conditionId}:${r.redeemParams.indexSet}:${r.redeemParams.isNegRisk ? 1 : 0}:${r.redeemParams.isYieldBearing ? 1 : 0}`;
      return !options.hideRedeemKeys.has(key);
    });

  if (usdtBalanceWei) {
    const usdt = weiToNumber(usdtBalanceWei, 18);
    if (usdt > 0) {
      rows.unshift({
        key: "usdt-collateral",
        marketId: "",
        marketTitle: "USDT collateral (wallet)",
        slugForLink: "",
        outcome: "USDT",
        shares: usdt,
        sharesDisplay: usdt.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        usdtBalanceDisplay: usdt.toFixed(2),
      });
    }
  }
  return rows;
}
