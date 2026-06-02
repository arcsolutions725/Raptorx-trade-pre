import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_CHAIN = "solana";

function normContract(s: string | null) {
  return (s || "").trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contractAddress = normContract(searchParams.get("contractAddress"));
    const chain = (searchParams.get("chain") || DEFAULT_CHAIN)
      .trim()
      .toLowerCase() || DEFAULT_CHAIN;
    if (!contractAddress) {
      return NextResponse.json(
        { ok: false, error: "contractAddress is required" },
        { status: 400 },
      );
    }

    const row = await prisma.goldenReportProject.findFirst({
      where: {
        chain,
        contractAddress: { equals: contractAddress, mode: "insensitive" },
        isGolden: true,
      },
      select: {
        teamUpdatesContent: true,
        teamUpdatesPublishedAt: true,
      },
    });

    if (!row) {
      return NextResponse.json({
        ok: true,
        eligible: false,
        content: "",
        publishedAt: null,
      });
    }

    return NextResponse.json({
      ok: true,
      eligible: true,
      content: row.teamUpdatesContent || "",
      publishedAt: row.teamUpdatesPublishedAt?.toISOString() ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("golden-reports team-updates public GET:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
