import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/limitless/comments?slug=...&page=1&limit=10
 * Proxies https://api.limitless.exchange/comments/markets/{slug}
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "10";

    if (!slug?.trim()) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }

    const params = new URLSearchParams({ page, limit });
    const url = `https://api.limitless.exchange/comments/markets/${encodeURIComponent(slug.trim())}?${params.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Limitless comments error:", err);
      return NextResponse.json(
        { error: `Limitless API ${res.status}: ${err}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Limitless comments error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch comments";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
