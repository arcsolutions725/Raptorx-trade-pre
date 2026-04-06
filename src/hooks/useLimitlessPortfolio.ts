"use client";

import { useQuery } from "@tanstack/react-query";
import { useLimitlessAuth } from "@/hooks/useLimitlessAuth";
import { useWallet } from "@/contexts/WalletContext";

/** Trade item from Limitless GET /portfolio/trades (shape may vary by API) */
export type LimitlessTrade = {
  id?: string;
  marketSlug?: string;
  market?: string;
  side?: string;
  outcome?: string;
  /** e.g. "won", "Market Buy" from API action/strategy */
  action?: string;
  price?: number | string;
  size?: number | string;
  amount?: number | string;
  timestamp?: number | string;
  createdAt?: string;
  [key: string]: unknown;
};

/** Position item from Limitless GET /portfolio/positions */
export type LimitlessPosition = {
  id?: string;
  marketSlug?: string;
  market?: string;
  outcome?: string;
  size?: number | string;
  balance?: number | string;
  tokenId?: string;
  /** Market status e.g. FUNDED, CLOSED, RESOLVED */
  status?: string;
  /** Whether the market is closed (true = show "Yes", false = show "No") */
  marketClosed?: boolean;
  /** Resolved/closed value (e.g. realisedPnl or value when market closed) */
  closed?: string | number;
  /** Market expiration/deadline (ISO or display string) */
  expirationDate?: string | null;
  /** Rewards for this CLOB position */
  rewards?: string | number | Record<string, unknown> | null;
  [key: string]: unknown;
};

/** CLOB entry from Limitless GET /portfolio/positions (response has clob: LimitlessClobEntry[]) */
type LimitlessClobEntry = {
  market?: {
    slug?: string;
    title?: string;
    status?: string;
    closed?: boolean;
    deadline?: string;
    [key: string]: unknown;
  };
  positions?: {
    yes?: {
      cost?: string;
      marketValue?: string;
      realisedPnl?: string;
      unrealizedPnl?: string;
      [key: string]: unknown;
    };
    no?: {
      cost?: string;
      marketValue?: string;
      realisedPnl?: string;
      unrealizedPnl?: string;
      [key: string]: unknown;
    };
  };
  rewards?: Record<string, unknown> | string | number;
  [key: string]: unknown;
};

const USDC_DECIMALS = 1e6;

function formatClobRewards(rewards: unknown): string | undefined {
  if (rewards == null) return undefined;
  if (typeof rewards === "string") return rewards;
  if (typeof rewards === "number") return String(rewards);
  if (typeof rewards === "object" && "userRewards" in (rewards as Record<string, unknown>)) {
    const r = rewards as { userRewards?: string | number };
    const n = Number(r.userRewards);
    if (Number.isFinite(n)) return (n / USDC_DECIMALS).toFixed(2);
  }
  return undefined;
}

function flattenLimitlessClobPositions(clob: LimitlessClobEntry[]): LimitlessPosition[] {
  const out: LimitlessPosition[] = [];
  for (const entry of clob) {
    const market = entry.market ?? {};
    const slug = market.slug ?? "";
    const title = market.title ?? slug;
    const status = market.status ?? "";
    const closed = market.closed === true;
    const expirationDate = market.deadline ?? null;
    const rewardsStr = formatClobRewards(entry.rewards);
    const positions = entry.positions ?? {};
    if (positions.yes) {
      const cost = positions.yes.cost ?? positions.yes.marketValue;
      if (cost && Number(Number(cost)) > 0) {
        out.push({
          marketSlug: slug,
          market: title,
          outcome: "Yes",
          size: cost,
          balance: cost,
          status: status || undefined,
          marketClosed: closed,
          closed: closed ? (positions.yes.realisedPnl ?? positions.yes.marketValue ?? cost) : undefined,
          expirationDate: expirationDate ?? undefined,
          rewards: rewardsStr ?? entry.rewards ?? undefined,
        });
      }
    }
    if (positions.no) {
      const cost = positions.no.cost ?? positions.no.marketValue;
      if (cost && Number(Number(cost)) > 0) {
        out.push({
          marketSlug: slug,
          market: title,
          outcome: "No",
          size: cost,
          balance: cost,
          status: status || undefined,
          marketClosed: closed,
          closed: closed ? (positions.no.realisedPnl ?? positions.no.marketValue ?? cost) : undefined,
          expirationDate: expirationDate ?? undefined,
          rewards: rewardsStr ?? entry.rewards ?? undefined,
        });
      }
    }
  }
  return out;
}

type LimitlessPortfolioTradesParams = {
  limit?: number;
  cursor?: string;
  enabled?: boolean;
};

export function useLimitlessPortfolioTrades({
  limit = 50,
  cursor,
  enabled = true,
}: LimitlessPortfolioTradesParams = {}) {
  const { ethersSigner } = useWallet();
  const { user } = useLimitlessAuth(ethersSigner);
  const sessionCookie = user?.sessionCookie as string | undefined;

  const hasSession = !!sessionCookie;
  const queryEnabled = enabled && hasSession;

  return useQuery({
    queryKey: ["limitless-portfolio-trades", sessionCookie ? "ok" : "none", limit, cursor],
    queryFn: async (): Promise<{ trades: LimitlessTrade[]; cursor?: string }> => {
      if (!sessionCookie) return { trades: [] };
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);
      const url = `/api/limitless/portfolio/trades?${params.toString()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "X-Limitless-Session": sessionCookie },
        cache: "no-store",
      });
      if (!res.ok) {
        const errText = await res.text();
        const err = (() => {
          try {
            return JSON.parse(errText) as { error?: string };
          } catch {
            return { error: errText };
          }
        })();
        throw new Error((err as { error?: string }).error ?? `Trades ${res.status}`);
      }
      const data = (await res.json()) as
        | {
            trades?: LimitlessTrade[];
            data?: any[];
            cursor?: string;
            totalCount?: number;
          }
        | LimitlessTrade[];

      let trades: LimitlessTrade[] = [];
      let nextCursor: string | undefined;

      if (Array.isArray(data)) {
        trades = data;
      } else if (Array.isArray(data.trades)) {
        trades = data.trades;
        nextCursor = data.cursor;
      } else if (Array.isArray(data.data)) {
        // portfolio/history style: data: [{ market, outcomeTokenPrice, outcomeTokenAmount, outcomeIndex, blockTimestamp, ... }]
        trades = (data.data as any[]).map((item) => {
          const market = item.market ?? {};
          const outcomeIndex = item.outcomeIndex as number | undefined;
          const outcome =
            outcomeIndex === 0 ? "Yes" : outcomeIndex === 1 ? "No" : item.outcome ?? "";
          const price = item.outcomeTokenPrice ?? item.price;
          const size =
            item.outcomeTokenAmount ??
            (Array.isArray(item.outcomeTokenAmounts) && outcomeIndex != null
              ? item.outcomeTokenAmounts[outcomeIndex]
              : item.size);
          // collateralAmount = actual USDC spent/received (after fees); outcomeTokenAmount = shares
          const amount = item.collateralAmount ?? item.amount;
          const timestamp = item.blockTimestamp ?? item.timestamp;
          const action = item.action ?? item.strategy;
          return {
            id: (item.transactionHash ?? String(timestamp ?? "")) as string,
            marketSlug: market.slug,
            market: market.title ?? market.slug,
            outcome,
            action,
            price,
            size,
            amount,
            timestamp,
          } as LimitlessTrade;
        });
        nextCursor = undefined;
      }

      return { trades, cursor: nextCursor };
    },
    enabled: queryEnabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

type LimitlessPortfolioPositionsParams = {
  enabled?: boolean;
};

export function useLimitlessPortfolioPositions({
  enabled = true,
}: LimitlessPortfolioPositionsParams = {}) {
  const { ethersSigner } = useWallet();
  const { user } = useLimitlessAuth(ethersSigner);
  const sessionCookie = user?.sessionCookie as string | undefined;

  const hasSessionPos = !!sessionCookie;
  const queryEnabledPos = enabled && hasSessionPos;

  return useQuery({
    queryKey: ["limitless-portfolio-positions", sessionCookie ? "ok" : "none"],
    queryFn: async (): Promise<LimitlessPosition[]> => {
      if (!sessionCookie) return [];
      const url = "/api/limitless/portfolio/positions";
      const res = await fetch(url, {
        method: "GET",
        headers: { "X-Limitless-Session": sessionCookie },
        cache: "no-store",
      });
      if (!res.ok) {
        const errText = await res.text();
        const err = (() => {
          try {
            return JSON.parse(errText) as { error?: string };
          } catch {
            return { error: errText };
          }
        })();
        throw new Error((err as { error?: string }).error ?? `Positions ${res.status}`);
      }
      const data = (await res.json()) as
        | LimitlessPosition[]
        | { positions?: LimitlessPosition[]; clob?: LimitlessClobEntry[]; amm?: unknown[] };
      if (Array.isArray(data)) return data;
      if (data.positions && Array.isArray(data.positions)) return data.positions;
      const clob = (data as { clob?: LimitlessClobEntry[] }).clob;
      if (clob && Array.isArray(clob)) return flattenLimitlessClobPositions(clob);
      return [];
    },
    enabled: queryEnabledPos,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
