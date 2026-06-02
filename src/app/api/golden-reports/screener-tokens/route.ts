import { NextResponse } from "next/server";
import { getGoldenReportScreenerTokenRows } from "@/lib/goldenReportScreenerTokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { items, registryCount } = await getGoldenReportScreenerTokenRows({
      includeAge: false,
    });
    const res = NextResponse.json({ ok: true, items, registryCount });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("golden-reports screener-tokens GET:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
