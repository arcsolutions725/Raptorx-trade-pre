"use client";

/**
 * Full Report pieces for the Rex Pilot report in the RexScreener panel (design/report.html).
 * The panel is narrower than the prototype's 3-column reader, so it follows the reader's
 * tablet/phone layout: "In short" opens the report, and the rail cards (Key facts, Actions,
 * Recently generated) drop below it. Everything here comes from the saved report and its
 * DexScreener pair; nothing is shown when the data isn't there.
 * Styles: styles/pages/reports.css (.rx-fr-*, .rx-wn-facts, .rx-wn-actions, .rx-wn-recent).
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import copy from "copy-to-clipboard";
import { displayReportSectionTitle, type RexReportSection } from "@/lib/reportToc";
import { hrefForScreenerToken } from "@/lib/rexscreenerRoutes";
import { requestShellAction } from "@/components/ui/layout/shellActions";
import {
  RecentReportsCard,
  TokenActionsCard,
  WhatsNewFactsCard,
  hasFacts,
  type RecentReport,
  type RecentReports,
  type TokenChartAction,
  type WhatsNewFacts,
} from "@/components/ui/modal/WhatsNewModal";
import { IconCheck, IconCopy } from "./screenerSideUi";
import "@/styles/pages/reports.css";

/* ------------------------------------------------------------------ */
/* Report text                                                         */
/* ------------------------------------------------------------------ */

/** Markdown → plain text (reading time, the "In short" line). */
export function stripReportMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** "· N min read": words in the report text at 200 words a minute. Null while there is barely any text. */
export function reportReadMinutes(md: string): number | null {
  const words = stripReportMarkdown(md)
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (words < 40) return null;
  return Math.max(1, Math.round(words / 200));
}

/** A section the report itself titles as its summary (TL;DR, In short, Key takeaways …). */
const SUMMARY_TITLE = /\b(tl;?\s?dr|in short|executive summary|summary|key takeaways?|bottom line)\b/i;
/** The generator's opening section: "What It Is — a concise summary of the project". */
const WHAT_IT_IS = /\bwhat\s+it\s+is\b/i;
const MAX_SHORT = 320;

function firstSentences(text: string): string {
  const re = /[.!?](?=\s+["'“‘(]?[A-Z0-9$]|\s*$)/g;
  let cut = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + 1;
    if (end > MAX_SHORT) break;
    cut = end;
    if (end >= 60) break;
  }
  if (cut > 0) return text.slice(0, cut).trim();
  if (text.length <= MAX_SHORT) return text;
  const clip = text.slice(0, MAX_SHORT);
  const sp = clip.lastIndexOf(" ");
  return `${(sp > 200 ? clip.slice(0, sp) : clip).replace(/[\s,;:–-]+$/, "")}…`;
}

/**
 * "In short" (design .report-takeaway): the opening of the report's own summary — a TL;DR /
 * Summary section when the report has one, else its "What It Is" summary section. First prose
 * line only (no headings, bullets, tables or "**Label:** value" fact lines).
 */
export function reportInShort(sections: RexReportSection[]): string | null {
  const src =
    sections.find((s) => SUMMARY_TITLE.test(s.title)) ??
    sections.find((s) => WHAT_IT_IS.test(s.title));
  if (!src) return null;
  for (const raw of src.body) {
    const line = raw.trim();
    if (!line || /^(#{1,6}\s|\||!\[|[-*+]\s|\d+\.\s|>)/.test(line)) continue;
    if (/^\*\*[^*]{1,40}:?\*\*:?/.test(line) && line.length < 140) continue;
    const text = stripReportMarkdown(line);
    if (text.length < 40) continue;
    return firstSentences(text);
  }
  return null;
}

/** "Copy report": the report as markdown — title, when it was generated, then every visible section. */
export function reportCopyText({
  ticker,
  projectName,
  updatedAt,
  sections,
}: {
  ticker?: string | null;
  projectName?: string | null;
  updatedAt?: string | Date | null;
  sections: RexReportSection[];
}): string {
  const name = [ticker, projectName && projectName !== ticker ? projectName : null].filter(Boolean).join(" · ");
  const d = updatedAt ? new Date(updatedAt) : null;
  const parts = [`# ${name || "Rex Pilot report"}`];
  parts.push(
    d && !Number.isNaN(d.getTime())
      ? `Rex Pilot intelligence report · updated ${d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
      : "Rex Pilot intelligence report",
  );
  for (const s of sections) {
    const body = s.body.join("\n").trim();
    if (!body) continue;
    parts.push(`## ${displayReportSectionTitle(s.title)}\n\n${body}`);
  }
  return parts.join("\n\n");
}

/** Saved reports (GET /api/reports rows) → the "Recently generated" list, newest first, without `excludeId`. */
export function recentReportItems(
  reports: ReadonlyArray<Record<string, unknown>>,
  excludeId: string,
  max = 3,
): RecentReport[] {
  const time = (r: Record<string, unknown>) => {
    const t = new Date(String(r.updatedAt ?? r.createdAt ?? "")).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  return reports
    .filter((r) => String(r.id) !== excludeId && r.reportType !== "market")
    .slice()
    .sort((a, b) => time(b) - time(a))
    .slice(0, max)
    .map((r) => {
      const ticker = String(r.ticker ?? "").trim().replace(/^\$/, "");
      const name = String(r.projectName ?? "").trim();
      const t = time(r);
      return {
        id: String(r.id),
        title: ticker ? `$${ticker}` : name || "Report",
        detail: [name && name !== ticker ? name : null, t ? new Date(t).toLocaleDateString("en-US") : null]
          .filter(Boolean)
          .join(" · ") || null,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Open chart                                                          */
/* ------------------------------------------------------------------ */

/** Chain ids hrefForScreenerToken maps to a RexScreener chain page. */
const SCREENER_CHAINS = new Set([
  "solana",
  "bsc",
  "bnb",
  "56",
  "base",
  "8453",
  "ethereum",
  "eth",
  "1",
  "monad",
  "10143",
  "robinhood",
  "4663",
]);

function subscribeDocked(cb: () => void) {
  const m = window.matchMedia("(min-width: 1024px)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** The panel sits beside the page from 1024px (RexScreenerShell `lg:`); below that it covers it. */
function useDockedPanel(): boolean {
  return useSyncExternalStore(
    subscribeDocked,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

/**
 * "Open chart" for the report's token. On that token's page the chart is already there: beside
 * a docked panel the action is left out; when the panel covers the page it closes the panel
 * (the Header's Rex Pilot toggle). From any other page it links to the token page as a full
 * load, since the shell keeps its current chart token on a client-side route change.
 */
export function useTokenChartAction(
  chain: string | null | undefined,
  address: string | null | undefined,
): TokenChartAction | null {
  const pathname = usePathname();
  const docked = useDockedPanel();
  return useMemo(() => {
    const addr = (address || "").trim();
    if (!addr) return null;
    const c = String(chain || "").trim().toLowerCase();
    // only chains RexScreener has pages for; an 0x contract never defaults to Solana
    if (c && !SCREENER_CHAINS.has(c)) return null;
    if (/^0x/i.test(addr) && (!c || c === "solana")) return null;
    if (!c && addr.length < 32) return null;
    const href = hrefForScreenerToken(c || "solana", addr);
    const seg = (pathname || "").split("/").filter(Boolean)[1] ?? "";
    let here = false;
    try {
      here = decodeURIComponent(seg).toLowerCase() === addr.toLowerCase();
    } catch {
      here = seg.toLowerCase() === addr.toLowerCase();
    }
    if (!here) return { href };
    if (docked) return null;
    return { href, onOpen: () => requestShellAction("pilot") };
  }, [chain, address, pathname, docked]);
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

export const IN_SHORT_ID = "rex-report-in-short";

/** "In short:" box at the top of the report (design .report-takeaway). */
export function ReportInShort({ text }: { text: string }) {
  return (
    <div className="rx-fr-short" id={IN_SHORT_ID}>
      <b>In short:</b> {text}
    </div>
  );
}

/** Report head "Copy report" (design .rep-head__tools): copies the report text, "Report copied" for a moment. */
export function CopyReportButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);
  const label = copied ? "Report copied" : "Copy report";
  return (
    <span className="ss-tipwrap">
      <button
        type="button"
        onClick={() => {
          const text = getText();
          if (text && copy(text)) setCopied(true);
        }}
        className={`rx-icon-btn${copied ? " ss-rh__ok" : ""}`}
        title={label}
        aria-label={label}
      >
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
      {copied ? (
        <span className="ss-tip" role="status">
          Report copied
        </span>
      ) : null}
    </span>
  );
}

/**
 * The reader's rail, below the report (design report.html aside.rail at tablet/phone width):
 * Key facts, Actions (Ask Claw about SYM · Open chart · What's New), Recently generated.
 */
export function ReportRail({
  symbol,
  facts,
  chart,
  onWhatsNew,
  whatsNewBusy,
  recent,
}: {
  symbol?: string | null;
  facts: WhatsNewFacts | null;
  chart: TokenChartAction | null;
  onWhatsNew?: (() => void) | null;
  whatsNewBusy?: boolean;
  recent?: RecentReports | null;
}) {
  const showFacts = hasFacts(facts);
  const showRecent = !!recent?.items.length;
  const showActions = !!symbol || !!chart || !!onWhatsNew;
  if (!showFacts && !showRecent && !showActions) return null;
  return (
    <aside className="rx-fr-rail" aria-label="Token details">
      {showFacts ? <WhatsNewFactsCard facts={facts} /> : null}
      {showActions ? (
        <TokenActionsCard symbol={symbol} chart={chart} onWhatsNew={onWhatsNew} whatsNewBusy={whatsNewBusy} />
      ) : null}
      {showRecent ? <RecentReportsCard recent={recent!} /> : null}
    </aside>
  );
}
