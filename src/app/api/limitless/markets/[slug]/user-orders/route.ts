import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * GET /api/limitless/markets/[slug]/user-orders
 * Proxies to Limitless: GET /markets/{slug}/user-orders
 * Returns all orders placed by the authenticated user for the market.
 * Query: statuses (LIVE | MATCHED), limit
 * @see https://api.limitless.exchange/api-v1#tag/trading/GET/markets/%7Bslug%7D/user-orders
 */
export async function GET(
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

    const { searchParams } = new URL(request.url);
    const statuses = searchParams.get("statuses");
    const limit = searchParams.get("limit");
    const query = new URLSearchParams();
    if (statuses) query.set("statuses", statuses);
    if (limit) query.set("limit", limit);
    const qs = query.toString();
    const url = `${LIMITLESS_API}/markets/${encodeURIComponent(slug)}/user-orders${qs ? `?${qs}` : ""}`;
    const response = await fetch(url, {
      method: "GET",
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
          error: `Limitless user-orders returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless user-orders error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch user orders" },
      { status: 500 }
    );
  }
}
