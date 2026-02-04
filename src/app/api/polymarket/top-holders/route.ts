/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("market");
    const conditionId = searchParams.get("condition_id"); // Fallback for backward compatibility
    const limitParam = parseInt(searchParams.get("limit") || "20");
    // API caps limit at 20, but we'll fetch all and return all
    const limit = Math.min(Math.max(limitParam, 0), 20);

    // Use market parameter (preferred) or fallback to condition_id
    // The API expects condition ID (0x-prefixed 64-hex string)
    const market = marketId || conditionId;

    if (!market || market.trim() === "") {
      console.error("Missing market parameter:", { marketId, conditionId });
      return NextResponse.json(
        { error: "market parameter is required (or condition_id for backward compatibility)" },
        { status: 400 }
      );
    }

    // Use Polymarket Data API for holders
    // Endpoint: https://data-api.polymarket.com/holders
    // The market parameter should be a condition ID (0x-prefixed 64-hex string)
    const holdersUrl = `https://data-api.polymarket.com/holders?market=${encodeURIComponent(market)}&limit=${limit}`;
    
    console.log("Fetching Polymarket top holders:", holdersUrl);

    const response = await fetch(holdersUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Polymarket Data API error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: holdersUrl,
      });
      throw new Error(`Polymarket Data API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    console.log("Polymarket holders data received:", JSON.stringify(data).substring(0, 500));

    // Parse the response from Polymarket Data API
    // The response structure is an array of token objects:
    // [
    //   { token: "...", holders: [...] }, // First token = Yes holders (outcomeIndex: 0)
    //   { token: "...", holders: [...] }  // Second token = No holders (outcomeIndex: 1)
    // ]
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({
        yesHolders: [],
        noHolders: [],
        total: 0,
      });
    }

    // Extract holders from the first token (Yes holders) and second token (No holders)
    // The API already separates them: first token = Yes, second token = No
    const yesTokenData = data[0];
    const noTokenData = data[1];

    const yesHoldersRaw = yesTokenData?.holders || [];
    const noHoldersRaw = noTokenData?.holders || [];

    // Map Yes holders to the expected format - return ALL data without limiting
    // Filter out holders where the name field is empty
    const yesHolders = yesHoldersRaw
      .filter((h: any) => {
        // Filter out holders with empty name field (check original name field, not pseudonym)
        const hasName = h.name && h.name.trim() !== "";
        return hasName && h.proxyWallet && parseFloat(h.amount || h.shares || h.balance || "0") > 0;
      })
      .map((h: any) => ({
        address: h.proxyWallet || h.address || "",
        shares: parseFloat(h.amount || h.shares || h.balance || "0"),
        amount: parseFloat(h.amount || h.shares || h.balance || "0"),
        outcome: "Yes" as const,
        name: h.name || h.pseudonym || "",
        pseudonym: h.pseudonym || "",
        profileImage: h.profileImage || h.profileImageOptimized || "",
        percentage: h.percentage || undefined,
      }))
      .sort((a:any, b:any) => b.shares - a.shares);
      // Don't limit - return all holders

    // Map No holders to the expected format - return ALL data without limiting
    // Filter out holders where the name field is empty
    const noHolders = noHoldersRaw
      .filter((h: any) => {
        // Filter out holders with empty name field (check original name field, not pseudonym)
        const hasName = h.name && h.name.trim() !== "";
        return hasName && h.proxyWallet && parseFloat(h.amount || h.shares || h.balance || "0") > 0;
      })
      .map((h: any) => ({
        address: h.proxyWallet || h.address || "",
        shares: parseFloat(h.amount || h.shares || h.balance || "0"),
        amount: parseFloat(h.amount || h.shares || h.balance || "0"),
        outcome: "No" as const,
        name: h.name || h.pseudonym || "",
        pseudonym: h.pseudonym || "",
        profileImage: h.profileImage || h.profileImageOptimized || "",
        percentage: h.percentage || undefined,
      }))
      .sort((a:any, b:any) => b.shares - a.shares);
      // Don't limit - return all holders

    return NextResponse.json({
      yesHolders: yesHolders,
      noHolders: noHolders,
      total: yesHolders.length + noHolders.length,
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    console.error("Polymarket top holders error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to fetch Polymarket top holders", details: msg },
      { status: 500 }
    );
  }
}

