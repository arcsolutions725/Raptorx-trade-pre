import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * DELETE /api/limitless/orders/all/[slug]
 * Proxies to Limitless: DELETE /orders/all/{slug}
 * Cancel all of the authenticated user's orders in the given market.
 * @see https://api.limitless.exchange/api-v1#tag/trading/DELETE/orders/all/%7Bslug%7D
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
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

    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Market slug required" }, { status: 400 });
    }

    const url = `${LIMITLESS_API}/orders/all/${encodeURIComponent(slug)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Cookie: `limitless_session=${sessionCookie}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          error: `Limitless orders/all returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless orders/all error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to cancel orders" },
      { status: 500 }
    );
  }
}
