import { NextRequest, NextResponse } from "next/server";

const DFLOW_METADATA_BASE =
  process.env.DFLOW_METADATA_API_BASE ||
  "https://b.prediction-markets-api.dflow.net";

const isProductionMetadata = (base: string) =>
  base.includes("b.prediction-markets-api.dflow.net");

/**
 * GET /api/kalshi/dflow-market-by-mint?mint={mint_address}
 * Fetches DFlow market by outcome or ledger mint. Returns market with yesAsk, noAsk, yesBid, noBid
 * for route_not_found handling (no liquidity on that side).
 * Docs: https://pond.dflow.net/build/metadata-api/markets/market-by-mint
 * Error codes: https://pond.dflow.net/build/error-codes#route_not_found
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mint = searchParams.get("mint");

    if (!mint || !mint.trim()) {
      return NextResponse.json(
        { error: "mint parameter is required (outcome or ledger mint address)" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DFLOW_API_KEY;
    const base = DFLOW_METADATA_BASE;
    const useProduction = isProductionMetadata(base);

    const url = `${base}/api/v1/market/by-mint/${encodeURIComponent(mint.trim())}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (useProduction && apiKey) {
      headers["x-api-key"] = apiKey;
    }

    let response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (response.status === 403 && useProduction) {
      const devBase = "https://dev-prediction-markets-api.dflow.net";
      const devUrl = `${devBase}/api/v1/market/by-mint/${encodeURIComponent(mint.trim())}`;
      response = await fetch(devUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DFlow market-by-mint API error:", response.status, errorText);
      return NextResponse.json(
        { error: response.status === 404 ? "Market not found" : `DFlow error: ${response.status}` },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const market = (await response.json()) as {
      ticker?: string;
      yesAsk?: string | null;
      noAsk?: string | null;
      yesBid?: string | null;
      noBid?: string | null;
      accounts?: Record<string, { yesMint?: string; noMint?: string }>;
    };

    return NextResponse.json({
      ticker: market.ticker,
      yesAsk: market.yesAsk ?? null,
      noAsk: market.noAsk ?? null,
      yesBid: market.yesBid ?? null,
      noBid: market.noBid ?? null,
      accounts: market.accounts,
    });
  } catch (error) {
    console.error("DFlow market-by-mint API error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch market by mint";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
