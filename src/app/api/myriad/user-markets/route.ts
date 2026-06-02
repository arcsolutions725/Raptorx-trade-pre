import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText } from "@/lib/myriad/serverFetch";
import { MYRIAD_ORDER_BOOK_CHAIN_ID } from "@/lib/myriad/orderBookEip712";

/**
 * GET /api/myriad/user-markets?address=0x...&network_id=56
 * Proxies GET /users/:address/markets (positions + market metadata).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const address = sp.get("address")?.trim();
  if (!address || !address.startsWith("0x")) {
    return NextResponse.json({ error: "Missing or invalid address" }, { status: 400 });
  }

  const q = new URLSearchParams();
  q.set("trading_model", sp.get("trading_model")?.trim() || "all");
  const nid = sp.get("network_id")?.trim() ?? String(MYRIAD_ORDER_BOOK_CHAIN_ID);
  q.set("network_id", nid);
  const lim = sp.get("limit")?.trim();
  if (lim) q.set("limit", lim);
  const page = sp.get("page")?.trim();
  if (page) q.set("page", page);

  const path = `/users/${encodeURIComponent(address)}/markets`;

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
        { error: `Myriad user-markets ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad user-markets proxy failed: ${msg}` }, { status: 502 });
  }
}
