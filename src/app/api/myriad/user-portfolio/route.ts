import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText } from "@/lib/myriad/serverFetch";

/**
 * GET /api/myriad/user-portfolio?address=0x...&market_slug=...&network_id=56
 * Proxies GET /users/:address/portfolio (positions per outcome for a market slug).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const address = sp.get("address")?.trim();
  if (!address || !address.startsWith("0x")) {
    return NextResponse.json({ error: "Missing or invalid address" }, { status: 400 });
  }

  const q = new URLSearchParams();
  const slug = sp.get("market_slug")?.trim();
  if (slug) q.set("market_slug", slug);
  const nid = sp.get("network_id")?.trim() ?? "56";
  q.set("network_id", nid);
  q.set("trading_model", "all");
  q.set("limit", sp.get("limit")?.trim() ?? "50");
  q.set("page", sp.get("page")?.trim() ?? "1");

  const path = `/users/${encodeURIComponent(address)}/portfolio`;

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
        { error: `Myriad portfolio ${res.status}: ${detail}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Myriad portfolio proxy failed: ${msg}` }, { status: 502 });
  }
}
