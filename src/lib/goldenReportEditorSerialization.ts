import { marked } from "marked";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

/** Treat as raw HTML only when it clearly opens a block element (not e.g. "<3"). */
function looksLikeEditorHtml(s: string) {
  const t = s.trim();
  return /^<(p|div|h[1-6]|ul|ol|blockquote|span|strong|em|b|i)\b/i.test(t);
}

function stripScripts(html: string) {
  return html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
}

marked.use({
  breaks: true,
  gfm: true,
});

/** Markdown or legacy HTML → HTML for Tiptap `content`. */
export function markdownToEditorHtml(markdown: string): string {
  const raw = (markdown || "").trim();
  if (!raw) return "<p></p>";
  if (looksLikeEditorHtml(raw)) {
    return stripScripts(raw);
  }
  const html = marked.parse(raw, { async: false }) as string;
  return html.trim() ? html : "<p></p>";
}

/** Tiptap document HTML → markdown for API / RexScreener pipeline. */
export function editorHtmlToMarkdown(html: string): string {
  const h = (html || "").trim() || "<p></p>";
  return turndown.turndown(stripScripts(h)).trim();
}

/** Normalize markdown for equality checks (saved copy vs live editor output). */
export function canonicalTeamUpdatesMarkdown(markdown: string): string {
  return editorHtmlToMarkdown(markdownToEditorHtml(markdown ?? ""));
}
