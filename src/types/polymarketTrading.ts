export type OrderBookEntry = {
  price: number;
  size: number;
  total: number;
};

export type TopHolder = {
  address: string;
  shares: number;
  amount: number;
  outcome: "Yes" | "No";
  name?: string;
  pseudonym?: string;
  profileImage?: string;
  percentage?: number;
};

export type PolymarketTradingInterfaceProps = {
  eventTicker?: string | null;
  marketTitle?: string | null;
  totalVolume?: number;
  eventId?: string | null;
  onBack?: () => void;
  onReportGenerated?: (report: any) => void;
  userId?: string | null;
  /** Latest report id held in the event page; when cleared (e.g. sidebar back), reset "Generated!" UI. */
  sessionSavedReportId?: string | null;
};

export type TradeActivity = {
  transactionHash: string;
  side: "BUY" | "SELL";
  outcome?: string;
  outcomeIndex?: number;
  price: number;
  size: number;
  timestamp: number;
  name?: string;
  pseudonym?: string;
  proxyWallet?: string;
  profileImage?: string;
  profileImageOptimized?: string;
  title?: string;
};

