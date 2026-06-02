"use client";

import { useQuery } from "@tanstack/react-query";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";
import {
  parseMyriadOrdersListPayload,
  parseMyriadUserMarketsPayload,
  parseMyriadUserEventsPayload,
  type MyriadOrderRowParsed,
  type MyriadUserMarketPositionRow,
  type MyriadUserEventRowParsed,
} from "@/lib/myriad/parseMyriadModalApi";

export type { MyriadOrderRowParsed, MyriadUserMarketPositionRow, MyriadUserEventRowParsed };

export function useMyriadOrdersHistory(address: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["myriad-orders-history", address, MYRIAD_ORDER_BOOK_CHAIN_ID],
    enabled: Boolean(enabled && address),
    queryFn: async (): Promise<MyriadOrderRowParsed[]> => {
      const params = new URLSearchParams({
        trader: address!,
        network_id: String(MYRIAD_ORDER_BOOK_CHAIN_ID),
        limit: "100",
        offset: "0",
      });
      const res = await fetch(`/api/myriad/orders?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
        throw new Error(err);
      }
      return parseMyriadOrdersListPayload(json);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useMyriadUserMarketsModal(address: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["myriad-user-markets-modal", address, MYRIAD_ORDER_BOOK_CHAIN_ID],
    enabled: Boolean(enabled && address),
    queryFn: async (): Promise<MyriadUserMarketPositionRow[]> => {
      const params = new URLSearchParams({
        address: address!,
        network_id: String(MYRIAD_ORDER_BOOK_CHAIN_ID),
        trading_model: "all",
        limit: "100",
        page: "1",
      });
      const res = await fetch(`/api/myriad/user-markets?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
        throw new Error(err);
      }
      let rows = parseMyriadUserMarketsPayload(json);
      /** Docs: `/users/.../markets` groups by market; `/portfolio` is flat per outcome — use as fallback if empty. */
      if (rows.length === 0) {
        const pq = new URLSearchParams({
          address: address!,
          network_id: String(MYRIAD_ORDER_BOOK_CHAIN_ID),
          limit: "100",
          page: "1",
        });
        const pres = await fetch(`/api/myriad/user-portfolio?${pq.toString()}`, {
          cache: "no-store",
        });
        const pjson = await pres.json().catch(() => ({}));
        if (pres.ok) {
          rows = parseMyriadUserMarketsPayload(pjson);
        }
      }
      return rows;
    },
    staleTime: 15_000,
    refetchInterval: 35_000,
  });
}

/** User activity across markets (buy/sell/liquidity/claims) — includes AMM on-chain actions. */
export function useMyriadUserTradeEvents(address: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["myriad-user-events", address, MYRIAD_ORDER_BOOK_CHAIN_ID],
    enabled: Boolean(enabled && address),
    queryFn: async (): Promise<MyriadUserEventRowParsed[]> => {
      const params = new URLSearchParams({
        address: address!.toLowerCase(),
        network_id: String(MYRIAD_ORDER_BOOK_CHAIN_ID),
        limit: "100",
        page: "1",
      });
      const res = await fetch(`/api/myriad/user-events?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
        throw new Error(err);
      }
      return parseMyriadUserEventsPayload(json);
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
