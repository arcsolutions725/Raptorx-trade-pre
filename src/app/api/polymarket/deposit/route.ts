/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { error: "address parameter is required" },
        { status: 400 }
      );
    }

    // Validate address format (basic check for Ethereum address)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    const url = "https://bridge.polymarket.com/deposit";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: address,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket deposit API error response:", errorText);
      return NextResponse.json(
        { error: `Polymarket API returned ${response.status}: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching Polymarket deposit addresses:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch deposit addresses" },
      { status: 500 }
    );
  }
}

