/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

const DFLOW_METADATA_BASE =
  process.env.DFLOW_METADATA_API_BASE ||
  "https://b.prediction-markets-api.dflow.net";

/**
 * GET /api/kalshi/dflow-market?ticker=...
 * Fetches DFlow market by ticker and returns outcome mints for trading.
 * Used by Kalshi BuySellWidget for DFlow GET /order (inputMint/outputMint).
 * Docs: https://pond.dflow.net/build/metadata-api/markets/market
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker");

    if (!ticker) {
      return NextResponse.json(
        { error: "ticker parameter is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.DFLOW_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "DFlow API key not configured" },
        { status: 500 }
      );
    }

    const url = `${DFLOW_METADATA_BASE}/api/v1/market/${encodeURIComponent(ticker)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DFlow metadata API error:", response.status, errorText);
      return NextResponse.json(
        { error: `DFlow market not found: ${response.status}` },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const market = (await response.json()) as {
      ticker: string;
      accounts?: Record<
        string,
        {
          yesMint: string;
          noMint: string;
          isInitialized?: boolean;
          redemptionStatus?: string | null;
        }
      >;
    };

    // USDC mint (settlement mint) - DFlow recipes use this
    const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const accounts = market.accounts || {};
    const usdcAccount = accounts[USDC_MINT];

    if (!usdcAccount?.yesMint || !usdcAccount?.noMint) {
      // Fallback: use first settlement account that has yesMint/noMint
      const firstAccount = Object.values(accounts).find(
        (a: any) => a.yesMint && a.noMint
      );
      if (!firstAccount) {
        return NextResponse.json(
          { error: "Market has no outcome mints for trading" },
          { status: 400 }
        );
      }

      const settlementMint =
        Object.entries(accounts).find(
          ([_, a]: [string, any]) => a.yesMint === firstAccount.yesMint
        )?.[0] || USDC_MINT;

      return NextResponse.json({
        ticker: market.ticker,
        yesMint: firstAccount.yesMint,
        noMint: firstAccount.noMint,
        settlementMint,
        isInitialized: firstAccount.isInitialized,
      });
    }

    return NextResponse.json({
      ticker: market.ticker,
      yesMint: usdcAccount.yesMint,
      noMint: usdcAccount.noMint,
      settlementMint: USDC_MINT,
      isInitialized: usdcAccount.isInitialized,
    });
  } catch (error) {
    console.error("DFlow market API error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch DFlow market";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
