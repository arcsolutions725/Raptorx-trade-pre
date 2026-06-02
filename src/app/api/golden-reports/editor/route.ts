/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isGoldenEditorAuthorized,
  normalizeGoldenEditorEmail,
  sanitizeTeamUpdatesContent,
} from "@/lib/goldenReportTeamUpdate";

const DEFAULT_CHAIN = "solana";

function requireUserId(req: NextRequest): string {
  const uid = req.headers.get("x-user-id");
  if (!uid) throw new Error("Missing x-user-id header (User.cuid).");
  return uid;
}

function normChain(s: unknown) {
  const t = typeof s === "string" ? s.trim().toLowerCase() : "";
  return t || DEFAULT_CHAIN;
}

function normContract(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

export async function GET(req: NextRequest) {
  try {
    const userId = requireUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const editorEmail = normalizeGoldenEditorEmail(user?.email);
    if (!editorEmail) {
      return NextResponse.json({
        ok: true,
        projects: [] as const,
        reason: "no_email",
      });
    }

    const rows = await prisma.goldenReportProject.findMany({
      where: { isGolden: true },
      orderBy: { contractAddress: "asc" },
      select: {
        contractAddress: true,
        chain: true,
        authorizedEditorEmails: true,
        teamUpdatesContent: true,
        teamUpdatesPublishedAt: true,
      },
    });

    const projects = rows
      .filter((row) =>
        isGoldenEditorAuthorized(editorEmail, row.authorizedEditorEmails),
      )
      .map(({ authorizedEditorEmails: _ignored, ...project }) => project);

    return NextResponse.json({ ok: true, projects });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = requireUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const editorEmail = normalizeGoldenEditorEmail(user?.email);
    if (!editorEmail) {
      return NextResponse.json(
        { ok: false, error: "Account email is required to publish team updates." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const contractAddress = normContract(body?.contractAddress);
    const chain = normChain(body?.chain);
    const content = sanitizeTeamUpdatesContent(String(body?.content ?? ""));

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
    });

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Project is not on the Golden Reports list." },
        { status: 404 },
      );
    }

    if (!isGoldenEditorAuthorized(editorEmail, row.authorizedEditorEmails)) {
      return NextResponse.json(
        { ok: false, error: "You are not authorized to publish for this project." },
        { status: 403 },
      );
    }

    // Persist an explicit UTC instant, then let viewers localize it in UI.
    const publishedAtUtc = new Date(new Date().toISOString());

    const updated = await prisma.goldenReportProject.update({
      where: { id: row.id },
      data: {
        teamUpdatesContent: content,
        teamUpdatesPublishedAt: publishedAtUtc,
      },
      select: {
        contractAddress: true,
        chain: true,
        teamUpdatesContent: true,
        teamUpdatesPublishedAt: true,
      },
    });

    return NextResponse.json({ ok: true, project: updated });
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    const status = /x-user-id/.test(msg) ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
