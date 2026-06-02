import { NextRequest, NextResponse } from "next/server";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";
import { isPredictFunMarketOpen } from "@/lib/predictfun/filterOpenMarkets";

/**
 * GET /api/predictfun/search?query=...
 * Proxies GET /v1/search; falls back to client-side market title filter if upstream errors.
 */
export async function GET(request: NextRequest) {
  const incoming = request.nextUrl.searchParams;
  const query = incoming.get("query")?.trim() ?? incoming.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const params = new URLSearchParams({
    query,
    limit: incoming.get("limit") ?? "25",
    includeStats: incoming.get("includeStats") ?? "true",
    includeResolved: incoming.get("includeResolved") ?? "false",
  });

  try {
    const { ok, status, body, text } = await predictFunGetJson("/search", params);
    if (!ok) {
      // Fallback: search markets list by fetching and filtering titles
      const marketParams = new URLSearchParams({
        first: "50",
        status: "OPEN",
        includeStats: "true",
        sort: "VOLUME_24H_DESC",
      });
      const fallback = await predictFunGetJson<{ data?: unknown[] }>(
        "/markets",
        marketParams
      );
      if (!fallback.ok || !Array.isArray(fallback.body?.data)) {
        return NextResponse.json(
          { error: `Predict.fun search failed (${status})`, detail: text.slice(0, 300) },
          { status: status >= 500 ? 502 : status }
        );
      }
      const q = query.toLowerCase();
      const filtered = (fallback.body.data as { title?: string; question?: string }[]).filter(
        (m) =>
          isPredictFunMarketOpen(m) &&
          (String(m.title ?? "").toLowerCase().includes(q) ||
            String(m.question ?? "").toLowerCase().includes(q))
      );
      return NextResponse.json({
        success: true,
        data: { markets: filtered, categories: [] },
        _fallback: true,
      });
    }
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Predict.fun search failed: ${msg}` }, { status: 502 });
  }
}
