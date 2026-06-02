import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText } from "@/lib/myriad/serverFetch";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";

/**
 * GET /api/myriad/user-events?address=0x...&network_id=56&page=1&limit=100
 * Proxies Myriad GET /users/:address/events (user trade & activity history across markets).
 * @see https://docs.myriad.markets/builders/myriad-api-reference (GET /users/:address/events)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const address = sp.get("address")?.trim().toLowerCase();
  if (!address || !address.startsWith("0x")) {
    return NextResponse.json({ error: "Missing or invalid address" }, { status: 400 });
  }

  const q = new URLSearchParams();
  q.set("network_id", sp.get("network_id")?.trim() ?? String(MYRIAD_ORDER_BOOK_CHAIN_ID));
  const page = sp.get("page")?.trim() ?? "1";
  const limit = sp.get("limit")?.trim() ?? "100";
  q.set("page", page);
  q.set("limit", limit);
  const mid = sp.get("market_id")?.trim();
  if (mid) q.set("market_id", mid);
  const mslug = sp.get("market_slug")?.trim();
  if (mslug) q.set("market_slug", mslug);
  const since = sp.get("since")?.trim();
  if (since) q.set("since", since);
  const until = sp.get("until")?.trim();
  if (until) q.set("until", until);

  const path = `/users/${encodeURIComponent(address)}/events`;

  try {
    const res = await myriadFetchText(path, q);
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 400);
      try {
        const j = JSON.parse(text);
        detail = j.detail || j.message || j.error || detail;
      } catch {
        /* */
      }
      return NextResponse.json(
        { error: `Myriad user events ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad user events proxy failed: ${msg}` }, { status: 502 });
  }
}
