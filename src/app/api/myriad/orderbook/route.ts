import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText } from "@/lib/myriad/serverFetch";

/**
 * GET /api/myriad/orderbook?market_id=&network_id=&outcome=
 * Proxies GET /markets/{id}/orderbook — id must be on-chain market id + network_id.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const marketId = sp.get("market_id")?.trim();
  const networkId = sp.get("network_id")?.trim();
  const outcome = sp.get("outcome")?.trim() ?? "0";
  if (!marketId || !networkId) {
    return NextResponse.json(
      { error: "market_id and network_id are required" },
      { status: 400 }
    );
  }

  const q = new URLSearchParams({
    network_id: networkId,
    outcome,
  });

  try {
    const res = await myriadFetchText(
      `/markets/${encodeURIComponent(marketId)}/orderbook`,
      q
    );
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
        { error: detail, bids: [], asks: [] },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg, bids: [], asks: [] },
      { status: 502 }
    );
  }
}
