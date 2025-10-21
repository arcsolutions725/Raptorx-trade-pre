/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TokenHolderData {
  TokenHolderAddress: string;
  TokenHolderQuantity: string;
}

export interface HolderAnalytics {
  totalHolders: number;
  topHolders: TokenHolderData[];
  holderDistribution: {
    whaleHolders: number; // >1% of supply
    mediumHolders: number; // 0.1% - 1% of supply
    smallHolders: number; // <0.1% of supply
  };
  concentration: {
    top10Percentage: number;
    top50Percentage: number;
    top100Percentage: number;
  };
  security?: {
    riskScore: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    warnings: string[];
    safetyIndicators: string[];
    lpAnalysis: {
      totalHolders: number;
      lockedPercentage: number;
      topHolderPercentage: number;
      contractControlledLP: number;
      burntLPPercentage: number;
    };
  };
  tokenInfo?: TokenInfo;
}

export interface TokenInfo {
  contractAddress: string;
  tokenName: string;
  symbol: string;
  divisor: string;
  tokenType: string;
  totalSupply: string;
  blueCheckmark: string;
  description: string;
  website: string;
  email: string;
  blog: string;
  reddit: string;
  slack: string;
  facebook: string;
  twitter: string;
  github: string;
  telegram: string;
  wechat: string;
  linkedin: string;
  discord: string;
  whitepaper: string;
  tokenPriceUSD: string;
}

/**
 * Fetches the total number of token holders using BitQuery GraphQL API
 */
export async function fetchTotalHoldersCount(
  contractAddress: string,
  apiKey?: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  const key = apiKey || process.env.BITQUERY_API_KEY || "";

  if (!key) {
    return {
      success: false,
      error: "BitQuery API key not found",
    };
  }

  try {
    const url = "https://streaming.bitquery.io/graphql";
    const currentDate = new Date().toISOString().split("T")[0];

    const query = `{
  EVM(dataset: archive, network: bsc) {
    TokenHolders(
      date: "${currentDate}"
      tokenSmartContract: "${contractAddress.toLowerCase()}"
      where: { Balance: { Amount: { gt: "0" } } }
    ) {
      uniq(of: Holder_Address)
    }
  }
}`;

    const variables = "{}";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `BitQuery API error: ${response.status}`,
      };
    }

    const data = await response.json();

    if (data.errors) {
      return {
        success: false,
        error: `BitQuery API errors: ${JSON.stringify(data.errors)}`,
      };
    }

    const count = data.data?.EVM?.TokenHolders?.[0]?.uniq || 0;

    return {
      success: true,
      count,
    };
  } catch (error) {
    console.error("Error fetching total holders count:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Fetches token holder data using BitQuery GraphQL API for BNB Smart Chain
 */
export async function fetchTokenHolders(
  contractAddress: string,
  apiKey?: string,
  limit = 50
): Promise<{ success: boolean; data?: TokenHolderData[]; error?: string }> {
  const key = apiKey || process.env.BITQUERY_API_KEY || "";

  if (!key) {
    return {
      success: false,
      error: "BitQuery API key not found",
    };
  }

  try {
    const url = "https://streaming.bitquery.io/graphql";

    const query = `{
  EVM(dataset: archive, network: bsc) {
    TokenHolders(
      date: "${new Date().toISOString().split("T")[0]}"
      tokenSmartContract: "${contractAddress.toLowerCase()}"
      limit: { count: ${limit} }
      orderBy: { descending: Balance_Amount }
    ) {
      Holder {
        Address
      }
      Balance {
        Amount
      }
    }
  }
}`;

    const variables = "{}";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `BitQuery API error: ${response.status}`,
      };
    }

    const data = await response.json();

    if (data.errors) {
      return {
        success: false,
        error: `BitQuery API errors: ${JSON.stringify(data.errors)}`,
      };
    }

    const tokenHolders = data.data?.EVM?.TokenHolders || [];
    const holderData = convertBitQueryToHolderData(tokenHolders);

    return {
      success: true,
      data: holderData,
    };
  } catch (error) {
    console.error("Error fetching token holder data from BitQuery:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Convert BitQuery TokenHolders response to TokenHolderData format
 */
function convertBitQueryToHolderData(tokenHolders: any[]): TokenHolderData[] {
  const holders: TokenHolderData[] = tokenHolders
    .filter((holder) => {
      // Only include holders with positive balances
      const balance = parseFloat(holder.Balance?.Amount || "0");
      return balance > 0;
    })
    .map((holder) => ({
      TokenHolderAddress: holder.Holder?.Address || "",
      TokenHolderQuantity: holder.Balance?.Amount || "0",
    }))
    .filter((holder) => holder.TokenHolderAddress) // Remove entries without addresses
    .slice(0, 100); // Limit to top 100 holders

  return holders;
}

export async function fetchTokenInfo(
  contractAddress: string,
  apiKey?: string
): Promise<{ success: boolean; data?: TokenInfo; error?: string }> {
  const key = apiKey || process.env.BIRDEYE_API_KEY || "";

  if (!key) {
    return {
      success: false,
      error: "Birdeye API key not found",
    };
  }

  try {
    // Fetch both security data and metadata from Birdeye
    const [securityResponse, metadataResponse] = await Promise.all([
      fetch(
        `https://public-api.birdeye.so/defi/token_security?address=${encodeURIComponent(
          contractAddress
        )}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-chain": "bsc",
            "X-API-KEY": key,
          },
          cache: "no-store",
        }
      ),
      fetch(
        `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${encodeURIComponent(
          contractAddress
        )}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-chain": "bsc",
            "X-API-KEY": key,
          },
          cache: "no-store",
        }
      ),
    ]);

    if (!securityResponse.ok) {
      throw new Error(`Birdeye security API error: ${securityResponse.status}`);
    }

    const securityData = await securityResponse.json();
    let metadataData = null;

    // Metadata is optional, don't fail if it's not available
    if (metadataResponse.ok) {
      try {
        metadataData = await metadataResponse.json();
      } catch (error) {
        console.warn("Failed to parse metadata response:", error);
      }
    }

    if (!securityData.success) {
      return {
        success: false,
        error: `Birdeye security API error: Status code ${securityData.statusCode}`,
      };
    }

    const securityInfo = securityData.data;
    const metadata = metadataData?.data;

    // Convert Birdeye data to TokenInfo format
    const tokenInfo: TokenInfo = {
      contractAddress: contractAddress.toLowerCase(),
      tokenName: securityInfo.tokenName || metadata?.name || "",
      symbol: securityInfo.tokenSymbol || metadata?.symbol || "",
      divisor: (metadata?.decimals || 18).toString(),
      tokenType: "BEP20", // Default for BSC tokens
      totalSupply: securityInfo.totalSupply || "0",
      blueCheckmark: "false", // Not available in Birdeye
      description: "", // Not available in Birdeye security endpoint
      website: metadata?.extensions?.website || "",
      email: "", // Not available in Birdeye
      blog: "", // Not available in Birdeye
      reddit: "", // Not available in Birdeye
      slack: "", // Not available in Birdeye
      facebook: "", // Not available in Birdeye
      twitter: metadata?.extensions?.twitter || "",
      github: "", // Not available in Birdeye
      telegram: metadata?.extensions?.telegram || "",
      wechat: "", // Not available in Birdeye
      linkedin: "", // Not available in Birdeye
      discord: "", // Not available in Birdeye
      whitepaper: "", // Not available in Birdeye
      tokenPriceUSD: "0", // Would need separate price endpoint
    };

    return {
      success: true,
      data: tokenInfo,
    };
  } catch (error) {
    console.error("Error fetching token info from Birdeye:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Analyzes holder distribution and calculates concentration metrics
 */
export function analyzeHolderDistribution(
  holders: TokenHolderData[],
  totalSupply: string,
  totalHolders: number
): HolderAnalytics {
  const supply = parseFloat(totalSupply) || 1;
  const sortedHolders = [...holders].sort(
    (a, b) =>
      parseFloat(b.TokenHolderQuantity) - parseFloat(a.TokenHolderQuantity)
  );

  // Calculate distribution categories from the top holders we have
  let whaleHolders = 0;
  let mediumHolders = 0;
  let smallHolders = 0;

  // Calculate concentration percentages
  let top10Total = 0;
  let top50Total = 0;
  let top100Total = 0;

  sortedHolders.forEach((holder, index) => {
    const quantity = parseFloat(holder.TokenHolderQuantity);
    const percentage = (quantity / supply) * 100;

    // Distribution categories
    if (percentage >= 1) {
      whaleHolders++;
    } else if (percentage >= 0.1) {
      mediumHolders++;
    } else {
      smallHolders++;
    }

    // Concentration metrics
    if (index < 10) top10Total += quantity;
    if (index < 50) top50Total += quantity;
    if (index < 100) top100Total += quantity;
  });

  // Estimate remaining small holders
  const analyzedHolders = whaleHolders + mediumHolders + smallHolders;
  const remainingHolders = Math.max(0, totalHolders - analyzedHolders);
  smallHolders += remainingHolders;

  return {
    totalHolders,
    topHolders: sortedHolders.slice(0, 20), // Top 20 holders for display
    holderDistribution: {
      whaleHolders,
      mediumHolders,
      smallHolders,
    },
    concentration: {
      top10Percentage: (top10Total / supply) * 100,
      top50Percentage: (top50Total / supply) * 100,
      top100Percentage: (top100Total / supply) * 100,
    },
  };
}

/**
 * Gets comprehensive holder analytics for a BNB token including security analysis
 */
export async function getBNBHolderAnalytics(
  contractAddress: string,
  apiKey?: string
): Promise<{
  success: boolean;
  data?: HolderAnalytics;
  error?: string;
}> {
  try {
    console.log(
      `Fetching comprehensive analytics for token: ${contractAddress}`
    );

    // Import Birdeye security functions
    const { getBirdeyeSecurityAnalyticsWithMetadata } = await import(
      "./birdeyeSecurtiy"
    );

    // Fetch all data in parallel: holders, security, and token info
    const [totalHoldersResult, holdersResult, securityResult] =
      await Promise.all([
        fetchTotalHoldersCount(contractAddress, apiKey),
        fetchTokenHolders(contractAddress, apiKey, 1000), // Get top 1000 holders for analysis
        getBirdeyeSecurityAnalyticsWithMetadata(
          contractAddress,
          "bsc",
          process.env.BIRDEYE_API_KEY
        ),
      ]);

    console.log("Results received:", {
      totalHolders: totalHoldersResult.success,
      holders: holdersResult.success,
      security: securityResult.success,
    });

    if (!totalHoldersResult.success) {
      return {
        success: false,
        error: `Failed to fetch total holders: ${totalHoldersResult.error}`,
      };
    }

    if (!holdersResult.success) {
      return {
        success: false,
        error: `Failed to fetch holder data: ${holdersResult.error}`,
      };
    }

    const totalHolders = totalHoldersResult.count || 0;
    const holders = holdersResult.data || [];

    // Get total supply from security data or fall back to a default
    let totalSupply = "1";
    let tokenInfo: TokenInfo | undefined;

    if (securityResult.success && securityResult.data) {
      totalSupply = securityResult.data.tokenSecurity.totalSupply || "1";

      // Create token info from security and metadata
      const security = securityResult.data.tokenSecurity;
      const metadata = securityResult.data.metadata;

      tokenInfo = {
        contractAddress: contractAddress.toLowerCase(),
        tokenName: security.tokenName || metadata?.name || "",
        symbol: security.tokenSymbol || metadata?.symbol || "",
        divisor: (metadata?.decimals || 18).toString(),
        tokenType: "BEP20",
        totalSupply: security.totalSupply || "0",
        blueCheckmark: "false",
        description: "",
        website: metadata?.extensions?.website || "",
        email: "",
        blog: "",
        reddit: "",
        slack: "",
        facebook: "",
        twitter: metadata?.extensions?.twitter || "",
        github: "",
        telegram: metadata?.extensions?.telegram || "",
        wechat: "",
        linkedin: "",
        discord: "",
        whitepaper: "",
        tokenPriceUSD: "0",
      };
    }

    // Calculate analytics using the fetched holders for distribution analysis
    const analytics = analyzeHolderDistribution(
      holders,
      totalSupply,
      totalHolders
    );

    // Add security analysis and token info if available
    if (securityResult.success && securityResult.data) {
      analytics.security = {
        riskScore: securityResult.data.riskScore,
        riskLevel: securityResult.data.riskLevel,
        warnings: securityResult.data.warnings,
        safetyIndicators: securityResult.data.safetyIndicators,
        lpAnalysis: securityResult.data.lpAnalysis,
      };
    }

    if (tokenInfo) {
      analytics.tokenInfo = tokenInfo;
    }

    console.log("Analytics completed successfully:", {
      totalHolders: analytics.totalHolders,
      hasSecurityData: !!analytics.security,
      hasTokenInfo: !!analytics.tokenInfo,
      riskLevel: analytics.security?.riskLevel,
    });

    return {
      success: true,
      data: analytics,
    };
  } catch (error) {
    console.error("Error getting BNB holder analytics:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
