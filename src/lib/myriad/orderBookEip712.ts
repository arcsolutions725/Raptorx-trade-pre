/** BNB Smart Chain — OB exchange (mainnet). @see https://docs.myriad.markets/builders/contract-addresses */
export const MYRIAD_OB_EXCHANGE_BSC = "0xa0b6f8ef8EdB64f395018D1933f2273Ce9f0f16A" as const;

export const MYRIAD_ORDER_BOOK_CHAIN_ID = 56;

export const MYRIAD_WAD = 1e18;

const WAD_BI = BigInt(10) ** BigInt(18);

/** Limit price from whole cents 1–99 → exact `cents/100 * 1e18` (matches Myriad API integer math). */
export function myriadLimitPriceWeiFromCents(cents: number): string {
  if (!Number.isFinite(cents) || cents < 1 || cents > 99) return "0";
  const c = Math.round(cents);
  if (c < 1 || c > 99) return "0";
  return (BigInt(c) * (BigInt(10) ** BigInt(16))).toString();
}

/**
 * Share amount wei for a buy: `amount = (usd * 1e18) / price` in fixed-point,
 * with USD in micro-dollars — aligns with payloads like 58823529411764699136 at 34¢.
 */
export function myriadBuyShareAmountWeiFromUsd(priceWei: string, usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "0";
  if (!/^\d+$/.test(priceWei)) return "0";
  const pw = BigInt(priceWei);
  if (pw <= BigInt(0)) return "0";
  const usdMicro = BigInt(Math.round(usd * 1_000_000));
  if (usdMicro <= BigInt(0)) return "0";
  return ((usdMicro * (BigInt(10) ** BigInt(30))) / pw).toString();
}

export function getMyriadOrderEip712Types() {
  return {
    Order: [
      { name: "trader", type: "address" },
      { name: "marketId", type: "uint256" },
      { name: "outcomeId", type: "uint8" },
      { name: "side", type: "uint8" },
      { name: "amount", type: "uint256" },
      { name: "price", type: "uint256" },
      { name: "minFillAmount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "expiration", type: "uint256" },
    ],
  };
}

export function getMyriadOrderDomain(verifyingContract: string = MYRIAD_OB_EXCHANGE_BSC) {
  return {
    name: "MyriadCTFExchange",
    version: "1",
    chainId: MYRIAD_ORDER_BOOK_CHAIN_ID,
    verifyingContract,
  };
}

/**
 * Price in dollars (0–1) → 1e18 wei string.
 * Uses 8 fractional decimal digits then ×1e10 to avoid `0.34 * 1e18` float error vs `340000000000000000`.
 */
export function myriadPriceToWeiString(price: number): string {
  if (!Number.isFinite(price) || price <= 0 || price > 1) return "0";
  const micro = BigInt(Math.round(price * 1e8));
  let w = micro * (BigInt(10) ** BigInt(10));
  if (w < BigInt(1)) w = BigInt(1);
  if (w > WAD_BI) w = WAD_BI;
  return w.toString();
}

/** Human share count → 18-decimal share wei (reduced float error vs `shares * 1e18`). */
export function myriadSharesToWeiString(shares: number): string {
  if (!Number.isFinite(shares) || shares <= 0) return "0";
  const micro = BigInt(Math.round(shares * 1e8));
  const w = micro * (BigInt(10) ** BigInt(10));
  return w < BigInt(1) ? "0" : w.toString();
}

export function myriadRandomNonceString(): string {
  const part = BigInt(Math.floor(Math.random() * 1e9));
  const t = BigInt(Date.now());
  return ((t << BigInt(20)) + part).toString();
}
