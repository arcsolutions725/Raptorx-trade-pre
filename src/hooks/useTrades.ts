import { useQuery } from "@tanstack/react-query";
import type { ClobClient } from "@polymarket/clob-client";

export type PolymarketTrade = {
  id: string;
  market: string; // Condition ID
  asset_id: string;
  side: "BUY" | "SELL";
  size: string;
  price: string;
  maker_address: string;
  taker_address?: string;
  match_time: string;
  status: string;
  outcome?: string;
  trader_side?: "MAKER" | "TAKER";
  transaction_hash?: string;
  taker_order_id?: string;
  fee_rate_bps?: string;
  marketTitle?: string; // Will be populated by fetching market details
};

export default function useTrades(
  clobClient: ClobClient | null,
  walletAddress: string | undefined,
  limit: number = 50
) {
  return useQuery({
    queryKey: ["trades", walletAddress, limit],
    queryFn: async (): Promise<PolymarketTrade[]> => {
      if (!clobClient || !walletAddress) {
        return [];
      }

      try {
        const clobClientAny = clobClient as any;

        // Get trades using getTrades method
        const trades = await clobClientAny.getTrades();

        // Filter trades by wallet address (maker_address)
        // The trade response has maker_address field, and we need to check if it matches the wallet address
        const userTrades = (trades || []).filter((trade: any) => {
          const maker = (
            trade.maker_address ||
            trade.maker ||
            trade.makerAddress ||
            ""
          ).toLowerCase();
          const taker = (
            trade.taker_address ||
            trade.taker ||
            trade.takerAddress ||
            ""
          ).toLowerCase();
          const userAddr = walletAddress.toLowerCase();
          const matches = maker === userAddr || taker === userAddr;

          return matches;
        });

        return userTrades as PolymarketTrade[];
      } catch (err) {
        console.error("Error fetching trades:", err);
        return [];
      }
    },
    enabled: !!clobClient && !!walletAddress,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}
