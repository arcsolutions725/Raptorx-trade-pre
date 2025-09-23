/* eslint-disable @typescript-eslint/no-explicit-any */
import { getDexscreenerData, DexScreenerPair } from "./dexscreener";
import { getCoinGeckoData, CoinGeckoTokenData } from "./coingecko";

export interface UnifiedTokenData {
  contractAddress: string;
  dexData?: DexScreenerPair | null;
  coingeckoData?: CoinGeckoTokenData | null;
  error?: string;
}

/**
 * Fetches combined token data from DexScreener + CoinGecko
 */
export async function getTokenData(
  contractAddress: string
): Promise<UnifiedTokenData> {
  try {
    if (!contractAddress) {
      return { contractAddress, error: "Contract address is required" };
    }

    // Fetch DexScreener + CoinGecko data in parallel for speed
    const [dexData, coingeckoData] = await Promise.all([
      getDexscreenerData(contractAddress),
      getCoinGeckoData(contractAddress),
    ]);

    return {
      contractAddress,
      dexData: "error" in dexData ? null : dexData,
      coingeckoData: "error" in coingeckoData ? null : coingeckoData,
    };
  } catch (err: any) {
    console.error("Token Data API Error:", err.message || err);
    return { contractAddress, error: "Failed to fetch token data" };
  }
}
