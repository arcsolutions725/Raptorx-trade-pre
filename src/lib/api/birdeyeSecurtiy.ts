export interface BirdeyeTokenSecurityData {
  // Core security fields - Updated based on API response example
  antiWhaleModifiable: string;
  buyTax: string;
  canTakeBackOwnership: string;
  cannotBuy: string;
  cannotSellAll: string;
  creatorAddress: string;
  creatorBalance: string;
  creatorPercentage: string;
  externalCall: string;
  hiddenOwner: string;
  holderCount: string;
  honeypotWithSameCreator: string;
  isAntiWhale: string;
  isBlacklisted: string;
  isHoneypot: string;
  isInDex: string;
  isMintable: string;
  isOpenSource: string;
  isProxy: string;
  isWhitelisted: string;
  lpHolderCount: string;
  lpHolders?: Array<{
    address: string;
    tag: string;
    value: string | null; // amount of LP (can be null in API response)
    is_contract: number; // 1 = contract, 0 = EOA
    balance: string; // amount (can differ from value in some payloads)
    percent: string; // ***fraction*** of total (0.975 -> 97.5%)
    NFT_list: Array<{
      value: string; // value under the lock
      NFT_id: string;
      amount: string; // sometimes LP amount under the NFT
      in_effect: string; // "1" = active lock
      NFT_percentage: string;
    }> | null; // Can be null in API response
    is_locked: number; // usually 0; locks are exposed via NFT_list
  }>;
  lpTotalSupply: string;
  ownerAddress: string;
  ownerBalance: string;
  ownerChangeBalance: string;
  ownerPercentage: string;
  personalSlippageModifiable: string;
  sellTax: string;
  slippageModifiable: string;
  tokenName: string;
  tokenSymbol: string;
  totalSupply: string;
  tradingCooldown: string;
  transferPausable: string;
  transferTax: string;
  trustList?: string; // Added back as it may appear in some responses

  // Optional CEX info
  isInCex?: {
    listed: string;
    cex_list: string[];
  };
}

export interface BirdeyeSecurityResponse {
  data: BirdeyeTokenSecurityData;
  success: boolean;
  statusCode: number;
}

export interface SecurityAnalytics {
  tokenSecurity: BirdeyeTokenSecurityData;
  riskScore: number; // 0-100, higher = more risky
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
}

/**
 * Fetches token security data from Birdeye API
 */
export async function fetchBirdeyeTokenSecurity(
  contractAddress: string,
  chain: string = "bsc",
  apiKey?: string
): Promise<{
  success: boolean;
  data?: BirdeyeTokenSecurityData;
  error?: string;
}> {
  const key = apiKey || process.env.BIRDEYE_API_KEY;

  if (!key) {
    return {
      success: false,
      error: "Birdeye API key not found",
    };
  }

  try {
    const url = `https://public-api.birdeye.so/defi/token_security?address=${encodeURIComponent(
      contractAddress
    )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-chain": chain,
        "X-API-KEY": key,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Birdeye API error: ${response.status}`);
    }

    const data: BirdeyeSecurityResponse = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: `Birdeye API error: Status code ${data.statusCode}`,
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    console.error("Error fetching token security from Birdeye:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * LP analysis (fixed):
 * - normalizes fraction -> percentage for `percent`
 * - computes locked LP from active NFT_list entries (in_effect === "1")
 * - detects burned LP by address/tag
 */
function analyzeLiquidityPools(tokenSecurity: BirdeyeTokenSecurityData) {
  const lpHolders = tokenSecurity.lpHolders || [];
  const totalHolders = lpHolders.length;

  // Burn addresses (EVM)
  const BURN_ADDRS = new Set([
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
    "0x000000000000000000000000000000000000dEaD",
  ]);

  const toNum = (s?: string | null) => {
    const n = parseFloat(s || "0");
    return Number.isFinite(n) ? n : 0;
  };
  const fracToPct = (v: number) => (v <= 1 ? v * 100 : v);

  let totalValue = 0; // sum of holder.value
  for (const h of lpHolders) totalValue += toNum(h.value);

  if (totalValue === 0) {
    return {
      totalHolders,
      lockedPercentage: 0,
      topHolderPercentage: 0,
      contractControlledLP: 0,
      burntLPPercentage: 0,
    };
  }

  let lockedValue = 0;
  let contractControlledValue = 0;
  let burntValue = 0;
  let topHolderPct = 0;

  for (const h of lpHolders) {
    const holderValue = toNum(h.value);
    const rawPct = toNum(h.percent); // **fraction**
    const pct = fracToPct(rawPct); // → percentage

    if (pct > topHolderPct) topHolderPct = pct;

    if (h.is_contract === 1) {
      contractControlledValue += holderValue;
    }

    // Burned LP: known burn addresses or tags
    const addr = (h.address || "").toLowerCase();
    const tag = (h.tag || "").toLowerCase();
    if (BURN_ADDRS.has(addr) || tag.includes("burn") || tag.includes("dead")) {
      burntValue += holderValue;
    }

    // Locked LP: sum NFT_list entries with in_effect === "1"
    if (Array.isArray(h.NFT_list)) {
      for (const nft of h.NFT_list) {
        if ((nft.in_effect || "0") === "1") {
          // Prefer NFT 'value' as it reflects locked value coverage
          lockedValue += toNum(nft.value);
        }
      }
    }
  }

  const lockedPercentage = (lockedValue / totalValue) * 100;
  const contractControlledLP = (contractControlledValue / totalValue) * 100;
  const burntLPPercentage = (burntValue / totalValue) * 100;

  return {
    totalHolders,
    lockedPercentage,
    topHolderPercentage: topHolderPct,
    contractControlledLP,
    burntLPPercentage,
  };
}

/**
 * Calculates risk score based on Birdeye security data
 */
export function calculateBirdeyeRiskScore(
  tokenSecurity: BirdeyeTokenSecurityData,
  chain: string = "bsc"
): {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  warnings: string[];
  safetyIndicators: string[];
  lpAnalysis: {
    totalHolders: number;
    lockedPercentage: number;
    topHolderPercentage: number;
    contractControlledLP: number;
    burntLPPercentage: number;
  };
} {
  let riskScore = 0;
  const warnings: string[] = [];
  const safetyIndicators: string[] = [];

  // Honeypot detection (critical)
  if (tokenSecurity.isHoneypot === "1") {
    riskScore += 50;
    warnings.push("Token identified as honeypot - extremely high risk");
  } else if (tokenSecurity.isHoneypot === "0") {
    safetyIndicators.push("Not identified as honeypot");
  }

  // Trading restrictions
  if (tokenSecurity.cannotBuy === "1") {
    riskScore += 30;
    warnings.push("Token cannot be bought");
  }
  if (tokenSecurity.cannotSellAll === "1") {
    riskScore += 40;
    warnings.push("Token cannot be sold completely");
  }

  // Tax analysis
  const buyTax = parseFloat(tokenSecurity.buyTax || "0");
  const sellTax = parseFloat(tokenSecurity.sellTax || "0");
  const transferTax = parseFloat(tokenSecurity.transferTax || "0");

  if (buyTax > 10) {
    riskScore += 15;
    warnings.push(`High buy tax: ${buyTax}%`);
  } else if (buyTax === 0) {
    safetyIndicators.push("No buy tax");
  }

  if (sellTax > 10) {
    riskScore += 15;
    warnings.push(`High sell tax: ${sellTax}%`);
  } else if (sellTax === 0) {
    safetyIndicators.push("No sell tax");
  }

  if (transferTax > 5) {
    riskScore += 10;
    warnings.push(`Transfer tax detected: ${transferTax}%`);
  }

  // Creator/Owner concentration
  const creatorPercentage = parseFloat(tokenSecurity.creatorPercentage || "0");
  if (creatorPercentage > 50) {
    riskScore += 25;
    warnings.push(`High creator concentration: ${creatorPercentage}%`);
  } else if (creatorPercentage < 5) {
    safetyIndicators.push(`Low creator concentration: ${creatorPercentage}%`);
  }

  // Contract properties
  if (tokenSecurity.isProxy === "1") {
    riskScore += 5;
    warnings.push("Contract uses proxy pattern");
  }

  if (tokenSecurity.isOpenSource === "1") {
    safetyIndicators.push("Contract is open source");
  } else {
    riskScore += 5;
    warnings.push("Contract is not open source");
  }

  // Exchange listings
  if (tokenSecurity.isInCex?.listed === "1") {
    safetyIndicators.push(
      `Listed on CEX: ${
        tokenSecurity.isInCex.cex_list?.join(", ") || "Unknown"
      }`
    );
  }

  if (tokenSecurity.isInDex === "1") {
    safetyIndicators.push("Listed on DEX (e.g., PancakeSwap, Uniswap)");
  } else {
    riskScore += 10;
    warnings.push("Not listed on any DEX");
  }

  // Whitelisted status (replacement for trustList)
  if (tokenSecurity.isWhitelisted === "1") {
    safetyIndicators.push("Address is whitelisted");
  }

  // Liquidity Pool analysis (fixed math)
  const lpAnalysis = analyzeLiquidityPools(tokenSecurity);

  // LP risk factors - BNB/BSC projects specifics
  const isBNBProject =
    chain === "bsc" ||
    tokenSecurity.tokenSymbol === "WBNB" ||
    (tokenSecurity.tokenName || "").toLowerCase().includes("bnb");

  if (isBNBProject) {
    const hasBurn = lpAnalysis.burntLPPercentage > 0;
    const hasLockedLP = lpAnalysis.lockedPercentage > 0;

    if (hasBurn) {
      safetyIndicators.push(
        `LP tokens burnt: ${lpAnalysis.burntLPPercentage.toFixed(1)}%`
      );
    }
    if (hasLockedLP) {
      safetyIndicators.push(
        `LP tokens locked: ${lpAnalysis.lockedPercentage.toFixed(1)}%`
      );
    }
    if (!hasBurn && !hasLockedLP) {
      riskScore += 15;
      warnings.push(
        "LP tokens are not burnt or locked - liquidity can be removed"
      );
    }
  } else {
    // Generic rule for other chains
    if (lpAnalysis.lockedPercentage < 50) {
      riskScore += 15;
      warnings.push(
        `Low LP lock percentage: ${lpAnalysis.lockedPercentage.toFixed(1)}%`
      );
    } else if (lpAnalysis.lockedPercentage > 80) {
      safetyIndicators.push(
        `Good LP lock percentage: ${lpAnalysis.lockedPercentage.toFixed(1)}%`
      );
    }
  }

  if (lpAnalysis.topHolderPercentage > 70) {
    riskScore += 20;
    warnings.push(
      `High LP concentration: Top holder has ${lpAnalysis.topHolderPercentage.toFixed(
        1
      )}%`
    );
  }

  if (lpAnalysis.contractControlledLP > 50) {
    riskScore += 10;
    warnings.push(
      `High contract-controlled LP: ${lpAnalysis.contractControlledLP.toFixed(
        1
      )}%`
    );
  }

  // Holder count assessment
  const holderCount = parseInt(tokenSecurity.holderCount || "0", 10);
  if (holderCount < 100) {
    riskScore += 10;
    warnings.push(`Low holder count: ${holderCount.toLocaleString()}`);
  } else if (holderCount > 10000) {
    safetyIndicators.push(
      `Good holder distribution: ${holderCount.toLocaleString()} holders`
    );
  } else if (holderCount > 1000) {
    safetyIndicators.push(
      `Moderate holder count: ${holderCount.toLocaleString()} holders`
    );
  }

  // Determine risk level
  let level: "low" | "medium" | "high" | "critical";
  if (riskScore >= 70) {
    level = "critical";
  } else if (riskScore >= 40) {
    level = "high";
  } else if (riskScore >= 20) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    score: Math.min(100, riskScore),
    level,
    warnings,
    safetyIndicators,
    lpAnalysis,
  };
}

/**
 * Birdeye Token Metadata Interface
 */
export interface BirdeyeTokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  extensions: {
    twitter: string | null;
    website: string | null;
    telegram: string | null;
  } | null;
  logo_uri: string;
}

export interface BirdeyeMetadataResponse {
  data: BirdeyeTokenMetadata;
  success: boolean;
}

/**
 * Fetches token metadata from Birdeye API
 */
export async function fetchBirdeyeTokenMetadata(
  contractAddress: string,
  chain: string = "bsc",
  apiKey?: string
): Promise<{
  success: boolean;
  data?: BirdeyeTokenMetadata;
  error?: string;
}> {
  const key = apiKey || process.env.BIRDEYE_API_KEY;

  if (!key) {
    return {
      success: false,
      error: "Birdeye API key not found",
    };
  }

  try {
    const url = `https://public-api.birdeye.so/defi/v3/token/meta-data/single?address=${encodeURIComponent(
      contractAddress
    )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-chain": chain,
        "X-API-KEY": key,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Birdeye metadata API error: ${response.status}`);
    }

    const data: BirdeyeMetadataResponse = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: "Birdeye metadata API returned unsuccessful response",
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    console.error("Error fetching token metadata from Birdeye:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets comprehensive security analytics for a token using Birdeye API
 */
export async function getBirdeyeSecurityAnalytics(
  contractAddress: string,
  chain: string = "bsc",
  apiKey?: string
): Promise<{ success: boolean; data?: SecurityAnalytics; error?: string }> {
  try {
    const result = await fetchBirdeyeTokenSecurity(
      contractAddress,
      chain,
      apiKey
    );

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || "Failed to fetch security data",
      };
    }

    const { score, level, warnings, safetyIndicators, lpAnalysis } =
      calculateBirdeyeRiskScore(result.data, chain);

    return {
      success: true,
      data: {
        tokenSecurity: result.data,
        riskScore: score,
        riskLevel: level,
        warnings,
        safetyIndicators,
        lpAnalysis,
      },
    };
  } catch (error) {
    console.error("Error getting Birdeye security analytics:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets enhanced security analytics with metadata
 */
export async function getBirdeyeSecurityAnalyticsWithMetadata(
  contractAddress: string,
  chain: string = "bsc",
  apiKey?: string
): Promise<{
  success: boolean;
  data?: SecurityAnalytics & { metadata?: BirdeyeTokenMetadata };
  error?: string;
}> {
  try {
    // Fetch both security data and metadata in parallel
    const [securityResult, metadataResult] = await Promise.all([
      fetchBirdeyeTokenSecurity(contractAddress, chain, apiKey),
      fetchBirdeyeTokenMetadata(contractAddress, chain, apiKey),
    ]);

    if (!securityResult.success || !securityResult.data) {
      return {
        success: false,
        error: securityResult.error || "Failed to fetch security data",
      };
    }

    const { score, level, warnings, safetyIndicators, lpAnalysis } =
      calculateBirdeyeRiskScore(securityResult.data, chain);

    const analyticsData: SecurityAnalytics & {
      metadata?: BirdeyeTokenMetadata;
    } = {
      tokenSecurity: securityResult.data,
      riskScore: score,
      riskLevel: level,
      warnings,
      safetyIndicators,
      lpAnalysis,
    };

    // Add metadata if available
    if (metadataResult.success && metadataResult.data) {
      analyticsData.metadata = metadataResult.data;

      // Enhance safety indicators with metadata info - check extensions is not null
      if (metadataResult.data.extensions) {
        if (metadataResult.data.extensions.website) {
          analyticsData.safetyIndicators.push("Official website available");
        }
        if (metadataResult.data.extensions.twitter) {
          analyticsData.safetyIndicators.push("Official Twitter account");
        }
        if (metadataResult.data.extensions.telegram) {
          analyticsData.safetyIndicators.push("Official Telegram channel");
        }
      }
    }

    return {
      success: true,
      data: analyticsData,
    };
  } catch (error) {
    console.error("Error getting enhanced Birdeye security analytics:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
