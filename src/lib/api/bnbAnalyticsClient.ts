import type { HolderAnalytics } from "./bnbAnalytics";

/**
 * Client-side function to fetch BNB holder analytics via API route
 * This avoids exposing API keys to the client
 */
export async function fetchBNBHolderAnalytics(
  contractAddress: string
): Promise<{
  success: boolean;
  data?: HolderAnalytics;
  error?: string;
}> {
  try {
    const response = await fetch(
      `/api/bnb-analytics?contractAddress=${encodeURIComponent(
        contractAddress
      )}`,
      {
        method: "GET",
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `API response ${response.status}: ${response.statusText}`
      );
    }

    const result = await response.json();

    // The server returns the full result with enhanced security data and token info
    if (result.success && result.data) {
      // Return the complete enhanced analytics data including security analysis
      return {
        success: true,
        data: result.data as HolderAnalytics,
      };
    }

    return result;
  } catch (error) {
    console.error("Error fetching BNB holder analytics:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
