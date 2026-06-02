import { MIN_ORDER_SIZE } from "@/utils/validation";

/**
 * AMM sell share size for POST /markets/quote.
 *
 * Myriad’s `outcomes[].tokenId` is an **API/internal** id — it is **not** the ERC1155 `balanceOf`
 * token id on Conditional Tokens, so on-chain reads with it always return 0 and must not be used.
 *
 * Portfolio “available” can still round **up** vs what the contract will accept. When the user
 * sells ~100% of shown balance, trim slightly below the ceiling so the quoted share wei does not
 * exceed the wallet’s true balance.
 */
export function resolveAmmSellShareHumanForQuote(params: {
  flooredHuman: number;
  availableSharesCeiling?: number | null;
}): { shares: number } | { error: string } {
  const { flooredHuman, availableSharesCeiling } = params;

  if (!Number.isFinite(flooredHuman) || flooredHuman <= 0) {
    return { error: "Sell size is too small" };
  }

  let out = flooredHuman;

  if (
    availableSharesCeiling != null &&
    Number.isFinite(availableSharesCeiling) &&
    availableSharesCeiling > 0
  ) {
    const ceil = availableSharesCeiling;
    out = Math.min(out, ceil);
    // Near “sell all”: stay under indexer-rounded ceiling (0.01% + min dust).
    if (out >= ceil * 0.9995) {
      const trimmed = Math.max(MIN_ORDER_SIZE, ceil * (1 - 1e-4) - 1e-6);
      out = Math.min(out, trimmed);
    }
  }

  out = Math.floor(out * 1_000_000) / 1_000_000;
  if (!Number.isFinite(out) || out <= 0) {
    return { error: "Sell size is too small after matching your balance." };
  }
  if (out < MIN_ORDER_SIZE) {
    return { error: `Minimum sell is ${MIN_ORDER_SIZE} shares.` };
  }

  return { shares: out };
}
