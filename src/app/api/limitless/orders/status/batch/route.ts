import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * POST /api/limitless/orders/status/batch
 * Proxies to Limitless: POST /orders/status/batch
 * Fetches historical order statuses for multiple orders by orderId and/or clientOrderId.
 * Body: { items: [{ orderId?: string, clientOrderId?: string }] }
 * @see https://api.limitless.exchange/api-v1#tag/trading/POST/orders/status/batch
 */
export async function POST(request: NextRequest) {
  try {
    const sessionCookie =
      request.headers.get("X-Limitless-Session") ??
      request.cookies.get("limitless_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Limitless session required. Sign in to Limitless first." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const url = `${LIMITLESS_API}/orders/status/batch`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `limitless_session=${sessionCookie}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `Limitless orders/status/batch returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless orders/status/batch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch order status" },
      { status: 500 }
    );
  }
}
