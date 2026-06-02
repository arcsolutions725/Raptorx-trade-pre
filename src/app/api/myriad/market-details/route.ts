import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText } from "@/lib/myriad/serverFetch";
import { mapMyriadMarketDetailToMarketDetails } from "@/lib/myriad/mapMyriadMarketDetails";

/**
 * GET /api/myriad/market-details?slug=...
 * Proxies GET /markets/{slug} with x-api-key.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  const path = `/markets/${encodeURIComponent(slug)}`;
  const q = new URLSearchParams({ trading_model: "all" });
  try {
    const res = await myriadFetchText(path, q);
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        detail = j.detail || j.message || j.error || detail;
      } catch {
        /* */
      }
      return NextResponse.json(
        { error: `Myriad API error (${res.status}): ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    const raw = JSON.parse(text);
    const body = mapMyriadMarketDetailToMarketDetails(raw);
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Myriad market-details failed: ${msg}` },
      { status: 502 }
    );
  }
}
