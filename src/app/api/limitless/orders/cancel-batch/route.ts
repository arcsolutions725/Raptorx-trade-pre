import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * POST /api/limitless/orders/cancel-batch
 * Proxies to Limitless: POST /orders/cancel-batch
 * Cancel multiple orders. Body: { orderIds: string[] }
 * @see https://api.limitless.exchange/api-v1#tag/trading/POST/orders/cancel-batch
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
    const url = `${LIMITLESS_API}/orders/cancel-batch`;
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
          error: `Limitless orders/cancel-batch returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless orders/cancel-batch error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to cancel orders" },
      { status: 500 }
    );
  }
}
