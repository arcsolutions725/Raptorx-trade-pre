/**
 * Portfolio page (design/portfolio.html) data shapes, shared by /api/portfolio, /api/portfolio/history
 * and the client. Holdings are read on chain (Base); cost basis comes from the user's RaptorX swaps.
 */

/** Native ETH on Base, as a token key (swap records use the zero or 0xeeee… address for it). */
export const NATIVE_TOKEN_KEY = "native";

export type PortfolioToken = {
  /** Lowercase contract address, or NATIVE_TOKEN_KEY */
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number | null;
  change24h: number | null;
  logo: string | null;
  /** Deepest DexScreener pair, used for price history (GeckoTerminal) */
  pool: string | null;
  /** Dollar stablecoin: history is flat at $1 */
  stable?: boolean;
};

export type PortfolioBalance = {
  /** Lowercase wallet address */
  wallet: string;
  /** PortfolioToken.key */
  token: string;
  amount: number;
};

/** Swap-derived position for one token: units still held at average cost, plus realized PNL. */
export type PortfolioLedgerEntry = {
  units: number;
  costUsd: number;
  realizedUsd: number;
};

export type PortfolioResponse = {
  tokens: Record<string, PortfolioToken>;
  balances: PortfolioBalance[];
  /**
   * Keyed by lowercase wallet address (swaps made from that wallet) and "*" (every Base swap of the
   * user), then by token key. Empty when the user has no RaptorX swaps on Base.
   */
  ledger: Record<string, Record<string, PortfolioLedgerEntry>>;
  updatedAt: string;
};

export const PORTFOLIO_RANGES = ["24H", "7D", "30D", "90D", "ALL"] as const;
export type PortfolioRange = (typeof PORTFOLIO_RANGES)[number];

/** [unix seconds, close price in USD], oldest first */
export type PricePoint = [number, number];

export type PortfolioHistoryResponse = {
  range: PortfolioRange;
  /** Keyed by token key; tokens whose history could not be loaded are left out */
  series: Record<string, PricePoint[]>;
};
