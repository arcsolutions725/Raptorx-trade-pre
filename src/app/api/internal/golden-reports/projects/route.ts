/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Internal Golden Reports registry (for the RaptorX metrics / admin dashboard).
 *
 * Env: `INTERNAL_GOLDEN_REPORTS_ADMIN_SECRET` — send the same value in header
 * `x-raptorx-internal-admin-secret` on every request.
 *
 * Examples:
 * - List: `GET /api/internal/golden-reports/projects`
 * - Upsert: `POST /api/internal/golden-reports/projects`
 *   body `{"contractAddress":"…","chain":"solana","authorizedEditorEmails":["lead@project.com","ops@project.com"]}`
 * - Remove: `DELETE /api/internal/golden-reports/projects?contractAddress=…&chain=solana`
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInternalGoldenReportsAdmin } from "@/lib/auth/internalGoldenReportsAdmin";
import { normalizeGoldenEditorEmails } from "@/lib/goldenReportTeamUpdate";

const DEFAULT_CHAIN = "solana";

function normChain(s: unknown) {
  const t = typeof s === "string" ? s.trim().toLowerCase() : "";
  return t || DEFAULT_CHAIN;
}

function normContract(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

async function findProjectInsensitive(contractAddress: string, chain: string) {
  return prisma.goldenReportProject.findFirst({
    where: {
      chain,
      contractAddress: { equals: contractAddress, mode: "insensitive" },
    },
  });
}

/** GET — list all Golden Report projects (for internal metrics dashboard). */
export async function GET(req: NextRequest) {
  if (!isInternalGoldenReportsAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await prisma.goldenReportProject.findMany({
      where: { isGolden: true },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        contractAddress: true,
        chain: true,
        isGolden: true,
        authorizedEditorEmails: true,
        teamUpdatesPublishedAt: true,
        teamUpdatesContent: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ ok: true, projects: rows });
  } catch (e: any) {
    console.error("internal golden-reports GET:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

/**
 * POST — upsert one project (contract + chain + authorized editor emails).
 * Body: `{ contractAddress: string, chain?: string, authorizedEditorEmails?: string[], authorizedEditorEmail?: string | null }`
 */
export async function POST(req: NextRequest) {
  if (!isInternalGoldenReportsAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const contractAddress = normContract(body?.contractAddress);
    const chain = normChain(body?.chain);
    const authorizedEditorEmails = Array.isArray(body?.authorizedEditorEmails)
      ? normalizeGoldenEditorEmails(body.authorizedEditorEmails)
      : normalizeGoldenEditorEmails(
          body?.authorizedEditorEmail == null || body?.authorizedEditorEmail === ""
            ? []
            : [body.authorizedEditorEmail],
        );

    if (!contractAddress) {
      return NextResponse.json(
        { ok: false, error: "contractAddress is required" },
        { status: 400 },
      );
    }

    const existing = await findProjectInsensitive(contractAddress, chain);

    if (existing) {
      const updated = await prisma.goldenReportProject.update({
        where: { id: existing.id },
        data: {
          authorizedEditorEmails,
          // keep stored casing stable: prefer incoming canonical trim
          contractAddress,
          chain,
          isGolden: true,
        },
      });
      return NextResponse.json({ ok: true, project: updated });
    }

    const created = await prisma.goldenReportProject.create({
      data: {
        contractAddress,
        chain,
        authorizedEditorEmails,
        isGolden: true,
      },
    });
    return NextResponse.json({ ok: true, project: created });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Unique constraint conflict — contract may already exist under different casing; delete the old row or use matching casing.",
        },
        { status: 409 },
      );
    }
    console.error("internal golden-reports POST:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

/** DELETE — remove a project from the Golden Reports list. Query: contractAddress, chain */
export async function DELETE(req: NextRequest) {
  if (!isInternalGoldenReportsAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const contractAddress = normContract(searchParams.get("contractAddress"));
    const chain = normChain(searchParams.get("chain") || DEFAULT_CHAIN);
    if (!contractAddress) {
      return NextResponse.json(
        { ok: false, error: "contractAddress query param is required" },
        { status: 400 },
      );
    }
    const existing = await prisma.goldenReportProject.findFirst({
      where: {
        chain,
        contractAddress: { equals: contractAddress, mode: "insensitive" },
        isGolden: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Not found or not a Golden Reports row" },
        { status: 404 },
      );
    }
    await prisma.goldenReportProject.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("internal golden-reports DELETE:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
