import { NextResponse } from "next/server";
import axios from "axios";

export async function GET() {
  try {
    // Use demo API for categories
    const baseUrl = "https://demo-api.kalshi.co/v1";

    console.log("Fetching categories from:", `${baseUrl}/search/tags_by_categories`);

    const response = await axios.get(`${baseUrl}/search/tags_by_categories`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("Categories response:", JSON.stringify(response.data, null, 2));

    // Validate response structure
    if (!response.data || typeof response.data !== "object") {
      console.error("Invalid response data:", response.data);
      throw new Error("Invalid response from Kalshi API");
    }

    // Ensure tags_by_categories exists
    if (!response.data.tags_by_categories) {
      console.warn("Response missing tags_by_categories, returning empty object");
      return NextResponse.json(
        { tags_by_categories: {} },
        {
          headers: {
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        }
      );
    }

    return NextResponse.json(response.data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Kalshi API error:", error);
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });
    }
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch categories";
    
    return NextResponse.json(
      { error: errorMessage, tags_by_categories: {} },
      { status: 500 }
    );
  }
}
