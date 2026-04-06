import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * GET /api/limitless/markets/[slug]/locked-balance
 * Proxies to Limitless: GET /markets/{slug}/locked-balance
 * Returns the amount of funds locked in open orders for the authenticated user.
 * @see https://api.limitless.exchange/api-v1#tag/trading/GET/markets/%7Bslug%7D/locked-balance
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

    const url = `${LIMITLESS_API}/markets/${encodeURIComponent(slug)}/locked-balance`;
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
          error: `Limitless locked-balance returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless locked-balance error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch locked balance" },
      { status: 500 }
    );
  }
}
