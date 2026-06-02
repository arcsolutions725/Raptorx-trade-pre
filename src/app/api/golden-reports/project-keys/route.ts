import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { goldenRegistryKey } from "@/lib/goldenReportRegistryMatch";

export const dynamic = "force-dynamic";

/**
 * Normalized `chain:address` keys for Golden Report projects — used by RexScreener
 * (e.g. generate button) without loading full Birdeye rows.
 */
export async function GET() {
  try {
    const rows = await prisma.goldenReportProject.findMany({
      where: { isGolden: true },
      select: { contractAddress: true, chain: true },
    });
    const keys = [
      ...new Set(
        rows.map((r) => goldenRegistryKey(r.chain, r.contractAddress)),
      ),
    ];
    const res = NextResponse.json({ ok: true, keys });
    res.headers.set(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=120",
    );
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("golden-reports project-keys GET:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
