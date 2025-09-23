/* eslint-disable @typescript-eslint/no-explicit-any */
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export interface CoinGeckoMarketData {
  current_price: { [key: string]: number };
  market_cap: { [key: string]: number };
  total_volume: { [key: string]: number };
  price_change_percentage_24h?: number;
  price_change_percentage_7d?: number;
  price_change_percentage_30d?: number;
}

export interface CoinGeckoTokenData {
  id: string;
  symbol: string;
  name: string;
  asset_platform_id?: string;
  contract_address: string;
  hashing_algorithm?: string;
  description?: { [key: string]: string };
  image?: {
    thumb?: string;
    small?: string;
    large?: string;
  };
  market_data?: CoinGeckoMarketData;
  links?: {
    homepage?: string[];
    blockchain_site?: string[];
    repos_url?: {
      github?: string[];
    };
  };
}

export async function getCoinGeckoData(
  contractAddress: string
): Promise<CoinGeckoTokenData | { error: string }> {
  try {
    if (!contractAddress) {
      return { error: "Contract address is required" };
    }

    const url = `${COINGECKO_BASE}/coins/solana/contract/${contractAddress}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(
        "CoinGecko API Error:",
        response.status,
        response.statusText
      );
      return { error: `Failed to fetch CoinGecko data: ${response.status}` };
    }

    const data: CoinGeckoTokenData = await response.json();

    // If no data is returned
    if (!data || !data.id) {
      return { error: "No CoinGecko data found" };
    }

    return data;
  } catch (err: any) {
    console.error("CoinGecko API Error:", err.message || err);
    return { error: "Failed to fetch CoinGecko data" };
  }
}
