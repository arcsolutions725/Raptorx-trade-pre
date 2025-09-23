/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function requireUserId(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

// GET /api/reports  -> list current user's reports
export async function GET(req: NextRequest) {
  try {
    const userId = requireUserId(req);
    const reports = await prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contractAddress: true,
        ticker: true,
        projectName: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ ok: true, reports });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// POST /api/reports  -> create report (if you want a non-stream path)
export async function POST(req: NextRequest) {
  try {
    const userId = requireUserId(req);
    const { contractAddress, ticker, projectName, content, dexData } =
      (await req.json()) as {
        contractAddress: string;
        ticker: string;
        projectName?: string;
        content: string;
        dexData?: unknown;
      };

    if (!contractAddress || !ticker || !content) {
      return NextResponse.json(
        { ok: false, error: "Missing fields" },
        { status: 400 }
      );
    }

    const report = await prisma.report.create({
      data: {
        userId,
        contractAddress,
        ticker,
        projectName: projectName || undefined,
        content,
        dexData: dexData ?? undefined,
        conversation: { create: {} },
      },
      include: { conversation: { select: { id: true } } },
    });

    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
