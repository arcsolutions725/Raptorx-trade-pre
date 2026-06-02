import { Fragment, type ReactNode } from "react";

type Citation = { title: string; url: string; domain: string };

function toHtmlWithBold(s: string) {
  return s
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<strong>$1</strong>");
}

function normalizeSourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid",
    ]);
    for (const k of Array.from(url.searchParams.keys())) {
      if (drop.has(k)) url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function linkifyInline(input: string): string {
  const withMdLinks = input.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, href: string) => {
      const cleanHref = normalizeSourceUrl(href);
      return `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer" class="text-[#ffc000] underline decoration-[#ffc000]/70 underline-offset-2 hover:text-[#ffe07a]">${label}</a>`;
    },
  );

  return withMdLinks.replace(
    /(^|[\s(])((https?:\/\/[^\s)]+))/g,
    (_m, prefix: string, href: string) => {
      const cleanHref = normalizeSourceUrl(href);
      return `${prefix}<a href="${cleanHref}" target="_blank" rel="noopener noreferrer" class="text-[#ffc000] underline decoration-[#ffc000]/70 underline-offset-2 hover:text-[#ffe07a]">${cleanHref}</a>`;
    },
  );
}

function matchSectionHeaderKind(line: string): "sources" | "highlights" | null {
  let t = line.trim().replace(/^#{1,6}\s+/, "");
  t = t.replace(/\*+/g, "").trim();
  if (/^sources\s*:?\s*$/i.test(t)) return "sources";
  if (/^highlights\s*:?\s*$/i.test(t)) return "highlights";
  return null;
}

function parseCitationFromListLine(trimmed: string): Citation | null {
  const item = trimmed
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();

  const md = item.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
  if (md) {
    const title = md[1].trim();
    const url = normalizeSourceUrl(md[2].trim());
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      return { title, url, domain };
    } catch {
      return null;
    }
  }

  const bare = item.match(/(https?:\/\/[^\s)\]]+)/i);
  if (bare) {
    const url = normalizeSourceUrl(bare[1].replace(/[),.;!?]+$/g, ""));
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      return { title: domain, url, domain };
    } catch {
      return null;
    }
  }

  return null;
}

function extractCitationListBlock(
  lines: string[],
  start: number,
): { citations: Citation[]; nextIndex: number } | null {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  let j = start;

  for (; j < lines.length; j++) {
    const raw = lines[j];
    const trimmed = raw.trim();
    if (!trimmed) break;
    if (matchSectionHeaderKind(raw) !== null) break;
    if (!/^[-*]\s+/.test(trimmed) && !/^\d+\.\s+/.test(trimmed)) {
      if (citations.length === 0) return null;
      break;
    }

    const c = parseCitationFromListLine(trimmed);
    if (!c) {
      if (citations.length === 0) return null;
      break;
    }

    const key = c.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(c);
  }

  if (citations.length === 0) return null;
  return { citations, nextIndex: j };
}

function RexPilotLinkCardGrid({
  title,
  citations,
}: {
  title: string;
  citations: Citation[];
}) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 mb-2">
      <div className="rex-pilot-section-heading mb-2">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {citations.map((c) => (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex gap-3 rounded-xl border border-white/10 bg-[#141414] hover:border-[#FFC000]/60 transition-colors p-3"
            title={c.url}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                  c.domain,
                )}&sz=64`}
                alt=""
                className="h-6 w-6"
                loading="lazy"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-medium text-white/90"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {c.title || c.domain}
              </div>
              <div className="mt-1 truncate text-xs text-white/50">{c.domain}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function renderChatLine(row: string, key: string): ReactNode {
  if (!row.trim()) return null;

  if (row.startsWith("### ")) {
    return (
      <div key={key} className="mb-2">
        <h3 className="rex-report-chat-h3 mt-3 mb-1">
          <span
            dangerouslySetInnerHTML={{
              __html: linkifyInline(toHtmlWithBold(row.slice(4))),
            }}
          />
        </h3>
      </div>
    );
  }
  if (row.startsWith("## ")) {
    return (
      <div key={key} className="mb-2">
        <h2 className="rex-pilot-section-heading mt-4 mb-2">
          <span
            dangerouslySetInnerHTML={{
              __html: linkifyInline(toHtmlWithBold(row.slice(3))),
            }}
          />
        </h2>
      </div>
    );
  }
  if (/^#\s+/.test(row) && !row.startsWith("##")) {
    return (
      <div key={key} className="mb-2">
        <h1 className="rex-pilot-market-title mt-4 mb-2">
          <span
            dangerouslySetInnerHTML={{
              __html: linkifyInline(toHtmlWithBold(row.replace(/^#\s+/, ""))),
            }}
          />
        </h1>
      </div>
    );
  }

  const numbered = row.match(/^(\d+)\.\s+(.+)$/);
  if (numbered) {
    return (
      <div
        key={key}
        className="rex-pilot-body-text mb-2 flex items-start gap-2.5 pl-1"
      >
        <div
          className="flex min-h-[1.625em] w-7 shrink-0 items-baseline justify-end pt-0.5 text-white/75 tabular-nums"
          aria-hidden
        >
          {numbered[1]}.
        </div>
        <span
          className="min-w-0 flex-1"
          dangerouslySetInnerHTML={{
            __html: linkifyInline(toHtmlWithBold(numbered[2])),
          }}
        />
      </div>
    );
  }

  if (/^\*\s+/.test(row)) {
    const inner = linkifyInline(toHtmlWithBold(row.replace(/^\*\s+/, "")));
    return (
      <div
        key={key}
        className="rex-pilot-body-text mb-2 flex items-start gap-2.5 pl-1"
      >
        <div
          className="flex min-h-[1.625em] shrink-0 items-center"
          aria-hidden
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-[#f0cf7a]/70" />
        </div>
        <span className="min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: inner }} />
      </div>
    );
  }

  if (row.startsWith("- ")) {
    const inner = linkifyInline(toHtmlWithBold(row.slice(2)));
    return (
      <div
        key={key}
        className="rex-pilot-body-text mb-2 flex items-start gap-2.5 pl-1"
      >
        <div
          className="flex min-h-[1.625em] shrink-0 items-center"
          aria-hidden
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-[#f0cf7a]/70" />
        </div>
        <span className="min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: inner }} />
      </div>
    );
  }

  const html = linkifyInline(toHtmlWithBold(row));
  return (
    <div key={key} className="mb-2">
      <span className="rex-pilot-body-text" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

type Segment =
  | { type: "text"; lines: string[] }
  | { type: "cards"; title: string; citations: Citation[] };

/**
 * One citation grid titled "Sources": Highlights blocks use friendly titles; duplicate Sources blocks are dropped when Highlights exists.
 */
function mergeCitationSegments(segments: Segment[]): Segment[] {
  const hasHighlights = segments.some(
    (s) => s.type === "cards" && s.title === "Highlights",
  );

  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.type !== "cards") {
      out.push(seg);
      continue;
    }
    if (seg.title === "Highlights") {
      out.push({ ...seg, title: "Sources" });
      continue;
    }
    if (seg.title === "Sources") {
      if (hasHighlights) continue;
      out.push(seg);
      continue;
    }
    out.push(seg);
  }
  return out;
}

/**
 * Rex Pilot / RexScreener / RexMarkets chat body renderer.
 * **Highlights:** link lists render as Claw-style cards under **Sources**. Raw **Sources:** lists are omitted when Highlights cards exist (avoids duplicate URL cards).
 */
export function formatRexPilotChatLines(content: string): ReactNode {
  const inputLines = content.split("\n");
  const filteredLines: string[] = [];

  for (let idx = 0; idx < inputLines.length; idx++) {
    const line = inputLines[idx];
    const row = line.replace(/^---+$/, "").trimEnd();
    const nextRow = (inputLines[idx + 1] || "").trim();

    const mdUrls = Array.from(
      row.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g),
    ).map((m) => normalizeSourceUrl(m[1]));
    const nextStandaloneUrl = nextRow.match(/^\(?\s*(https?:\/\/[^\s)]+)\s*\)?$/);
    if (
      mdUrls.length > 0 &&
      nextStandaloneUrl &&
      mdUrls.includes(normalizeSourceUrl(nextStandaloneUrl[1]))
    ) {
      filteredLines.push(row);
      idx += 1;
      continue;
    }

    filteredLines.push(row);
  }

  const segments: Segment[] = [];
  let buf: string[] = [];

  const flushBuf = () => {
    if (buf.length > 0) {
      segments.push({ type: "text", lines: [...buf] });
      buf = [];
    }
  };

  let i = 0;
  while (i < filteredLines.length) {
    const row = filteredLines[i];
    const kind = matchSectionHeaderKind(row);

    if (kind) {
      const extracted = extractCitationListBlock(filteredLines, i + 1);
      if (extracted) {
        flushBuf();
        segments.push({
          type: "cards",
          title: kind === "sources" ? "Sources" : "Highlights",
          citations: extracted.citations,
        });
        i = extracted.nextIndex;
        continue;
      }
    }

    buf.push(row);
    i += 1;
  }
  flushBuf();

  const mergedSegments = mergeCitationSegments(segments);

  return (
    <Fragment>
      {mergedSegments.map((seg, segIdx) => {
        if (seg.type === "cards") {
          return (
            <RexPilotLinkCardGrid
              key={`rex-cards-${segIdx}-${seg.title}`}
              title={seg.title}
              citations={seg.citations}
            />
          );
        }
        return (
          <Fragment key={`rex-txt-${segIdx}`}>
            {seg.lines.map((line, li) =>
              renderChatLine(line, `${segIdx}-${li}`),
            )}
          </Fragment>
        );
      })}
    </Fragment>
  );
}
