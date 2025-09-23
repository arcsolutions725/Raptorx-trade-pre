/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function requireUserId(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

// GET /api/reports/[id] -> report with conversation/messages
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = requireUserId(req);

    const report = await prisma.report.findFirst({
      where: { id, userId },
      include: {
        conversation: {
          include: { messages: { orderBy: { timestamp: "asc" } } },
        },
      },
    });

    if (!report)
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 }
      );
    return NextResponse.json({ ok: true, report });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

// DELETE /api/reports/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const userId = requireUserId(req);

    const existing = await prisma.report.findFirst({ where: { id, userId } });
    if (!existing)
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 }
      );

    await prisma.report.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
