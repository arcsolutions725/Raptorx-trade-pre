import { NextRequest, NextResponse } from "next/server";
import { enrichReportScreenerTokenAges } from "@/lib/reportScreenerAgeEnrichment";

export const dynamic = "force-dynamic";

/**
 * Fill Age for screener rows that already rendered. Search returns tokens
 * first (Age as "—") then this endpoint patches `createdAt` in the background.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      items?: unknown[];
    };
    const items = Array.isArray(body.items)
      ? body.items.filter((x) => x && typeof x === "object")
      : [];

    const ages = await enrichReportScreenerTokenAges(items);
    const res = NextResponse.json({ ok: true, ages });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("trending/ages POST:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
