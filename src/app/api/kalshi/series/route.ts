import { Configuration, SeriesApi } from "kalshi-typescript";
import { NextRequest, NextResponse } from "next/server";

const getKalshiConfig = () => {
  const apiKey = process.env.KALSHI_API_KEY;
  const privateKeyPem = process.env.KALSHI_PRIVATE_KEY;
  const basePath = process.env.KALSHI_BASE_PATH || "https://api.elections.kalshi.com/trade-api/v2";

  if (!apiKey || !privateKeyPem) {
    throw new Error("Kalshi API credentials are not configured");
  }

  return new Configuration({
    apiKey,
    privateKeyPem,
    basePath,
  });
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const status = searchParams.get("status") || undefined;

    const config = getKalshiConfig();
    const seriesApi = new SeriesApi(config);

    const response = await seriesApi.getSeries(status);

    return NextResponse.json(response.data, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("Kalshi API error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch series";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
