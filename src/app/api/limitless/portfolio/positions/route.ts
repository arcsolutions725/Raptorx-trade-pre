import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * GET /api/limitless/portfolio/positions
 * Proxies to Limitless: GET /portfolio/positions
 * Requires session cookie: send header X-Limitless-Session with the session cookie value.
 * @see https://api.limitless.exchange/api-v1#tag/portfolio/GET/portfolio/positions
 */
export async function GET(request: NextRequest) {
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

    const url = `${LIMITLESS_API}/portfolio/positions`;
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
          error: `Limitless portfolio/positions returned ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless portfolio/positions error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
