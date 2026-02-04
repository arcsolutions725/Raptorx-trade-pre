export const formatPrice = (price: number): string => {
  return `${(price * 100).toFixed(2)}¢`;
};

/**
 * Get time ago string from date
 */
export const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)}w ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
  return `${Math.floor(diffInSeconds / 31536000)}y ago`;
};

/**
 * Format address for display (truncated)
 */
export const formatAddress = (address: string): string => {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Get time range based on interval
 * Note: This is kept for backward compatibility but not used for Polymarket API
 */
export const getTimeRange = (interval: string): { from: number; to: number } => {
  const now = Math.floor(Date.now() / 1000);
  const intervals: { [key: string]: number } = {
    "1H": 60 * 60,
    "6H": 6 * 60 * 60,
    "1D": 24 * 60 * 60,
    "1W": 7 * 24 * 60 * 60,
    "1M": 30 * 24 * 60 * 60,
    "ALL": 365 * 24 * 60 * 60,
    // Legacy support
    "5m": 5 * 60,
    "15m": 15 * 60,
    "1h": 60 * 60,
    "6h": 6 * 60 * 60,
    "1d": 24 * 60 * 60,
    "1w": 7 * 24 * 60 * 60,
    "1m": 30 * 24 * 60 * 60,
    All: 365 * 24 * 60 * 60,
  };
  const seconds = intervals[interval] || intervals["1W"];
  return { from: now - seconds, to: now };
};

/**
 * Get resolution in minutes based on interval
 * Note: This is kept for backward compatibility but not used for Polymarket API
 */
export const getResolution = (interval: string): number => {
  const resolutions: { [key: string]: number } = {
    "1H": 60,
    "6H": 360,
    "1D": 1440,
    "1W": 10080,
    "1M": 43200,
    "ALL": 43200,
    // Legacy support
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "6h": 360,
    "1d": 1440,
    "1w": 10080,
    "1m": 43200,
    All: 43200,
  };
  return resolutions[interval] || 60;
};

/**
 * Convert interval to Polymarket API format (lowercase with 'm' suffix for minutes)
 */
export const getPolymarketInterval = (interval: string): string => {
  const intervalMap: { [key: string]: string } = {
    "1H": "1h",
    "6H": "6h",
    "1D": "1d",
    "1W": "1w",
    "1M": "1m",
    "ALL": "all",
  };
  return intervalMap[interval] || "1h";
};

