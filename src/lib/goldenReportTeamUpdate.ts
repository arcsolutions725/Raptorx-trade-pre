import type { RexReportSection } from "@/lib/reportToc";

export const GOLDEN_TEAM_UPDATES_MAX_CHARS = 8000;
export const GOLDEN_TEAM_UPDATES_MAX_WORDS = 100;
export const GOLDEN_TEAM_UPDATES_EMPTY_FALLBACK =
  "There are no updates from the team.";

/** Known Core (Solana) mint for Golden Reports bootstrap — same as `prisma/seed.mjs`. */
export const GOLDEN_REPORT_CORE_SOLANA_CONTRACT =
  "4FdojUmXeaFMBG6yUaoufAC5Bz7u9AwnSAMizkx5pump";

export function normalizeGoldenEditorEmail(email: string | null | undefined) {
  if (!email || typeof email !== "string") return null;
  const t = email.trim().toLowerCase();
  return t.length ? t : null;
}

export function normalizeGoldenEditorEmails(
  emails: unknown,
): string[] {
  if (!Array.isArray(emails)) return [];
  const seen = new Set<string>();
  for (const email of emails) {
    const normalized = normalizeGoldenEditorEmail(
      typeof email === "string" ? email : null,
    );
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen);
}

export function isGoldenEditorAuthorized(
  candidateEmail: string | null | undefined,
  allowedEmails: unknown,
): boolean {
  const candidate = normalizeGoldenEditorEmail(candidateEmail);
  if (!candidate) return false;
  const normalizedAllowed = normalizeGoldenEditorEmails(allowedEmails);
  return normalizedAllowed.includes(candidate);
}

export function sanitizeTeamUpdatesContent(raw: string): string {
  let s = typeof raw === "string" ? raw : "";
  s = s.replace(/\u0000/g, "");
  s = truncateGoldenTeamUpdatesWords(s, GOLDEN_TEAM_UPDATES_MAX_WORDS);
  if (s.length > GOLDEN_TEAM_UPDATES_MAX_CHARS) {
    s = s.slice(0, GOLDEN_TEAM_UPDATES_MAX_CHARS);
  }
  return s.trimEnd();
}

export function countGoldenTeamUpdatesWords(text: string): number {
  const words = (text || "").trim().match(/\S+/g);
  return words ? words.length : 0;
}

export function truncateGoldenTeamUpdatesWords(
  text: string,
  maxWords: number = GOLDEN_TEAM_UPDATES_MAX_WORDS,
): string {
  if (!text || maxWords <= 0) return "";
  const matches = Array.from(text.matchAll(/\S+/g));
  if (matches.length <= maxWords) return text;
  const cut = matches[maxWords - 1];
  const end = (cut.index ?? 0) + cut[0].length;
  return text.slice(0, end);
}

/**
 * Team-authored text is rendered with `dangerouslySetInnerHTML` in Rex Pilot markdown.
 * Strip angle brackets so raw HTML cannot run in the browser.
 */
export function escapeHtmlForPilotTeamUpdateBody(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseUtcInstant(isoLike: string): Date | null {
  const raw = (isoLike || "").trim();
  if (!raw) return null;
  const hasZone = /(?:z|[+-]\d{2}:\d{2})$/i.test(raw);
  const utcIso = hasZone ? raw : `${raw}Z`;
  const parsed = new Date(utcIso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatGoldenPublishedAtForUserTimezone(
  publishedAtIso: string | null | undefined,
): string | null {
  if (!publishedAtIso) return null;
  const parsed = parseUtcInstant(publishedAtIso);
  if (!parsed) return null;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Insert a synthetic "Team Updates" section immediately before "What It Is". */
export function mergeGoldenTeamUpdatesSections(
  sections: RexReportSection[],
  teamMarkdown: string,
  publishedAtIso?: string | null,
): RexReportSection[] {
  const trimmed = sanitizeTeamUpdatesContent(teamMarkdown);
  const safe = escapeHtmlForPilotTeamUpdateBody(
    trimmed || GOLDEN_TEAM_UPDATES_EMPTY_FALLBACK,
  );
  const lines = safe.split("\n");
  const publishedLocal = formatGoldenPublishedAtForUserTimezone(publishedAtIso);
  const meta = publishedLocal && `Last published: ${publishedLocal}`;
  const bodyLines = meta ? [meta, "", ...lines] : lines;

  const teamSection: RexReportSection = {
    title: "Team Updates",
    body: bodyLines,
    id: "rex-report-section-golden-team-updates",
  };

  const idx = sections.findIndex((s) =>
    s.title.toLowerCase().includes("what it is"),
  );
  if (idx === -1) return [teamSection, ...sections];
  return [...sections.slice(0, idx), teamSection, ...sections.slice(idx)];
}
