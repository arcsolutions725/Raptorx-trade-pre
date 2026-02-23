import { NextRequest, NextResponse } from "next/server";

const DFLOW_QUOTE_API_BASE =
  process.env.DFLOW_QUOTE_API_BASE || "https://dev-quote-api.dflow.net";

/**
 * GET /api/kalshi/dflow-order-status?signature=...&lastValidBlockHeight=...
 * Proxies to DFlow GET /order-status.
 * Docs: https://pond.dflow.net/build/trading-api/order/order-status
 */
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.DFLOW_API_KEY;

    const { searchParams } = new URL(request.url);
    const signature = searchParams.get("signature");
    if (!signature) {
      return NextResponse.json(
        { error: "signature query parameter is required" },
        { status: 400 }
      );
    }

    const queryString = searchParams.toString();
    const url = `${DFLOW_QUOTE_API_BASE}/order-status?${queryString}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("DFlow order-status proxy error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "DFlow order-status request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
