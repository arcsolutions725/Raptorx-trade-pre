import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";

/**
 * Myriad REST uses per-deployment `network_id` values in GET /markets (often **2741** for BNB Chain
 * in API examples). EVM **chain id** for that deployment is {@link MYRIAD_ORDER_BOOK_CHAIN_ID} (56).
 */
export const MYRIAD_BSC_PROTOCOL_NETWORK_ID = 2741;

/**
 * `network_id` sent to GET /markets when the client omits it.
 * Defaults to BSC chain id **56** (product default). If the API returns no rows, set env
 * `MYRIAD_MARKETS_NETWORK_ID=2741` (or another id from Myriad) on the server.
 */
export function resolveMyriadMarketsListNetworkId(): string {
  const env = process.env.MYRIAD_MARKETS_NETWORK_ID?.trim();
  if (env && /^\d+$/.test(env)) return env;
  return String(MYRIAD_ORDER_BOOK_CHAIN_ID);
}
