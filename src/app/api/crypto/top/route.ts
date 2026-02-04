/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export interface TopCryptoToken {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  image?: string;
}

export async function GET() {
  try {
    // Fetch top 15 cryptocurrencies by market cap
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=15&page=1&sparkline=false&price_change_percentage=24h`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      next: { revalidate: 30 }, // Revalidate every 30 seconds
    });

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform to our format
    const tokens: TopCryptoToken[] = data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price || 0,
      price_change_percentage_24h: coin.price_change_percentage_24h || 0,
      market_cap: coin.market_cap || 0,
      image: coin.image,
    }));

    return NextResponse.json({ tokens }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching top cryptocurrencies:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch top cryptocurrencies" },
      { status: 500 }
    );
  }
}

