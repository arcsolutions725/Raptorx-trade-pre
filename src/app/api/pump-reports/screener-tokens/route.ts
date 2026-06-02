import { NextResponse } from "next/server";
import { getPumpReportScreenerTokenRows } from "@/lib/pumpReportScreenerTokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { items, registryCount } = await getPumpReportScreenerTokenRows({
      includeAge: false,
    });
    const res = NextResponse.json({ ok: true, items, registryCount });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("pump-reports screener-tokens GET:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
