import { NextRequest, NextResponse } from "next/server";
import { myriadFetchText } from "@/lib/myriad/serverFetch";

/**
 * GET /api/myriad/holders?slug=...&page=&limit=
 * Proxies GET /markets/{slug}/holders
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const slug = sp.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const forward = new URLSearchParams();
  for (const [k, v] of sp.entries()) {
    if (k === "slug") continue;
    forward.set(k, v);
  }

  try {
    const res = await myriadFetchText(
      `/markets/${encodeURIComponent(slug)}/holders`,
      forward
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
        { error: detail, data: [] },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, data: [] }, { status: 502 });
  }
}
