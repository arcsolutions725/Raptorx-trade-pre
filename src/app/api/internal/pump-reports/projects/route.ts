/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Internal Pump Reports registry — same `golden_report_projects` rows as Golden,
 * with `isGolden: false` (see Prisma `GoldenReportProject.isGolden`).
 *
 * Env: `INTERNAL_GOLDEN_REPORTS_ADMIN_SECRET` — header `x-raptorx-internal-admin-secret`
 *
 * Examples:
 * - List: `GET /api/internal/pump-reports/projects`
 * - Upsert: `POST /api/internal/pump-reports/projects`
 *   body `{"contractAddress":"…","chain":"solana"}`
 * - Remove: `DELETE /api/internal/pump-reports/projects?contractAddress=…&chain=solana`
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInternalGoldenReportsAdmin } from "@/lib/auth/internalGoldenReportsAdmin";

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

/** GET — list Pump Report projects (`isGolden` false). */
export async function GET(req: NextRequest) {
  if (!isInternalGoldenReportsAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = await prisma.goldenReportProject.findMany({
      where: { isGolden: false },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        contractAddress: true,
        chain: true,
        isGolden: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ ok: true, projects: rows });
  } catch (e: any) {
    console.error("internal pump-reports GET:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

/** POST — upsert one Pump listing (`isGolden` false). Flips tier if the contract already exists as Golden. */
export async function POST(req: NextRequest) {
  if (!isInternalGoldenReportsAdmin(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const contractAddress = normContract(body?.contractAddress);
    const chain = normChain(body?.chain);

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
          contractAddress,
          chain,
          isGolden: false,
        },
      });
      return NextResponse.json({ ok: true, project: updated });
    }

    const created = await prisma.goldenReportProject.create({
      data: {
        contractAddress,
        chain,
        isGolden: false,
        authorizedEditorEmails: [],
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
    console.error("internal pump-reports POST:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}

/** DELETE — remove a Pump Reports row (`isGolden` false only). Query: contractAddress, chain */
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
        isGolden: false,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Not found or not a Pump Reports row" },
        { status: 404 },
      );
    }
    await prisma.goldenReportProject.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("internal pump-reports DELETE:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
