import { NextRequest, NextResponse } from "next/server";

const LIMITLESS_API = "https://api.limitless.exchange";

/**
 * GET /api/limitless/portfolio/history
 * Proxies to Limitless: GET /portfolio/history
 * Requires session cookie: send header X-Limitless-Session with the session cookie value.
 * @see https://api.limitless.exchange/api-v1#tag/portfolio/GET/portfolio/history
 */
export async function GET(request: NextRequest) {
  try {
    const sessionCookie =
      request.headers.get("X-Limitless-Session") ??
      request.cookies.get("limitless_session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Limitless session required. Sign in to Limitless first." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ?? "50";
    const cursor = searchParams.get("cursor") ?? "";
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit);
    if (cursor) params.set("cursor", cursor);

    const url = `${LIMITLESS_API}/portfolio/history?${params.toString()}`;
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
          error: `Limitless portfolio/history returned ${response.status}: ${errorText}`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Limitless portfolio/history error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch history" },
      { status: 500 },
    );
  }
}
