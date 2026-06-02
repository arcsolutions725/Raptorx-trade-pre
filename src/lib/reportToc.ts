/** Stable HTML ids and labels for in-report navigation (RexScreener + similar). */

/** UI label for legacy report headings still titled "Individual Tweets" in markdown. */
export function displayReportSectionTitle(title: string): string {
  if (title.toLowerCase().includes("individual tweets")) {
    return title.replace(/individual tweets/gi, "Top Tweets");
  }
  return title;
}

export function slugifyReportHeading(text: string): string {
  const s = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return s || "section";
}

export type RexReportSection = { title: string; body: string[]; id: string };

const BNB_ONLY_SECTION_TITLE_MARKERS = [
  "holder analytics",
  "safety analytics",
  "bnb tokens only",
] as const;

function reportHeadingIsBnbOnlySection(titleNormalized: string): boolean {
  return BNB_ONLY_SECTION_TITLE_MARKERS.some((m) => titleNormalized.includes(m));
}

/**
 * Remove BNB-only report sections from raw markdown (streaming previews, ReactMarkdown paths).
 * Sections start at ## or single # (not ###).
 */
export function stripBnbOnlyReportSectionsFromMarkdown(
  markdown: string,
  isBnbChain: boolean,
): string {
  if (isBnbChain || !markdown.trim()) return markdown;

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const h = line.trimStart();
    if (h.startsWith("###")) {
      if (!skipping) out.push(line);
      continue;
    }
    if (h.startsWith("## ")) {
      const rawTitle = h.slice(3).replace(/^\d+\.\s*/, "").trim().toLowerCase();
      skipping = reportHeadingIsBnbOnlySection(rawTitle);
      if (!skipping) out.push(line);
      continue;
    }
    if (h.startsWith("# ") && !h.startsWith("##")) {
      const rawTitle = h.slice(2).replace(/^\d+\.\s*/, "").trim().toLowerCase();
      skipping = reportHeadingIsBnbOnlySection(rawTitle);
      if (!skipping) out.push(line);
      continue;
    }
    if (!skipping) out.push(line);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * Parse RexScreener AI report body (## sections) with the same visibility rules as the UI.
 */
export function parseRexScreenerReportSections(
  text: string,
  isBNBToken: boolean
): RexReportSection[] {
  const lines = text.split("\n");
  let cur = "";
  const sections: Record<string, string[]> = {};
  const order: string[] = [];

  const startSection = (rawLine: string) => {
    cur = rawLine.replace(/^\d+\.\s*/, "").trim();
    if (!(cur in sections)) {
      sections[cur] = [];
      order.push(cur);
    }
  };

  lines.forEach((line) => {
    if (line.startsWith("## ")) {
      startSection(line.substring(3).trim());
    } else if (line.startsWith("# ") && !line.startsWith("##")) {
      startSection(line.substring(2).trim());
    } else if (cur && line.trim()) {
      sections[cur].push(line);
    }
  });

  const out: RexReportSection[] = [];
  let visibleIndex = 0;
  for (const title of order) {
    const lower = title.toLowerCase();
    if (!isBNBToken && reportHeadingIsBnbOnlySection(lower)) {
      continue;
    }
    const slug = slugifyReportHeading(title);
    out.push({
      title,
      body: sections[title] ?? [],
      id: `rex-report-section-${visibleIndex}-${slug}`,
    });
    visibleIndex++;
  }
  return out;
}

export type MarkdownTocEntry = { level: 1 | 2 | 3; text: string; id: string };

/** Strip minimal markdown from a single heading line for display labels */
export function stripHeadingMarkdown(raw: string): string {
  return raw
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

/** Table of contents from standard # / ## / ### lines (Claw assistant markdown). */
export function parseMarkdownHeadingToc(markdown: string): MarkdownTocEntry[] {
  const out: MarkdownTocEntry[] = [];
  let i = 0;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      const level = m[1].length as 1 | 2 | 3;
      const text = stripHeadingMarkdown(m[2]);
      out.push({
        level,
        text,
        id: `claw-report-h-${i}`,
      });
      i++;
    }
  }
  return out;
}
