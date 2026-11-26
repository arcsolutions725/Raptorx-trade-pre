"use client";

import type React from "react";
import Image from "next/image";

/** Same body rendering as Rex Pilot / ChatInterface (not ReactMarkdown). */
export function renderRexPilotMarkdownSection(body: string): React.ReactNode {
  const lines = body.split("\n");
  const toHtml = (s: string) =>
    s
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>");

  return lines.map((line, idx) => {
    if (!line.trim()) return <div key={idx} className="h-3" />;
    if (line.startsWith("### ")) {
      return (
        <h3
          key={idx}
          className="rex-report-chat-h3 mt-4 mb-2"
          dangerouslySetInnerHTML={{ __html: toHtml(line.slice(4)) }}
        />
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2
          key={idx}
          className="rex-pilot-section-heading mt-4 mb-2"
          dangerouslySetInnerHTML={{ __html: toHtml(line.slice(3)) }}
        />
      );
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      return (
        <div
          key={idx}
          className="rex-pilot-body-text mb-2 flex items-start gap-2.5 pl-1"
        >
          <div
            className="flex min-h-[1.625em] shrink-0 items-baseline justify-end pt-0.5 w-7 text-white/75 tabular-nums"
            aria-hidden
          >
            {numbered[1]}.
          </div>
          <span
            className="min-w-0 flex-1"
            dangerouslySetInnerHTML={{ __html: toHtml(numbered[2]) }}
          />
        </div>
      );
    }

    if (/^\*\s+/.test(line)) {
      const bullet = toHtml(line.replace(/^\*\s+/, ""));
      return (
        <div
          key={idx}
          className="rex-pilot-body-text mb-2 flex items-start gap-2.5 pl-1"
        >
          <div
            className="flex min-h-[1.625em] shrink-0 items-center"
            aria-hidden
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-[#f0cf7a]/70" />
          </div>
          <span
            className="min-w-0 flex-1"
            dangerouslySetInnerHTML={{ __html: bullet }}
          />
        </div>
      );
    }

    const trimmed = line.trimStart();
    if (trimmed.startsWith("- ")) {
      const bullet = toHtml(trimmed.slice(2));
      return (
        <div
          key={idx}
          className="rex-pilot-body-text mb-2 flex items-start gap-2.5 pl-1"
        >
          <div
            className="flex min-h-[1.625em] shrink-0 items-center"
            aria-hidden
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-[#f0cf7a]/70" />
          </div>
          <span
            className="min-w-0 flex-1"
            dangerouslySetInnerHTML={{ __html: bullet }}
          />
        </div>
      );
    }

    return (
      <p
        key={idx}
        className="rex-pilot-body-text mb-3"
        dangerouslySetInnerHTML={{ __html: toHtml(line) }}
      />
    );
  });
}

type MdBlock =
  | { k: "p" | "h2" | "h3"; text: string }
  | { k: "ul"; items: string[] }
  | { k: "ol"; items: { n: string; text: string }[] }
  | { k: "table"; head: string[] | null; rows: string[][] };

const isTableLine = (line: string) => {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
};
const isTableRule = (line: string) =>
  /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());
/** "$72.22", "-7.74%", "1.2K", "▲ 132%": set in mono and right-aligned like the prototype's td.n. */
const isNumericCell = (cell: string) =>
  /^[\s$€£+\-−~≈<>▲▼]*\d[\d.,\s]*[%kmbtx]?\s*$/i.test(cell.replace(/\*/g, ""));
const tableCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/**
 * RexScreener sidebar report body (prototype .report typography): the same line rules and
 * bold handling as `renderRexPilotMarkdownSection`, grouped into real lists, numbered lists and
 * tables so they get the design's gold-square bullets and mono table heads
 * (styles/pages/screener-side.css `.ss-md`). Claw keeps the original renderer above.
 */
export function renderScreenerReportMarkdown(body: string): React.ReactNode {
  const toHtml = (s: string) =>
    s
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<strong>$1</strong>");

  const lines = body.split("\n");
  const blocks: MdBlock[] = [];
  const last = () => blocks[blocks.length - 1];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      // a blank line ends a list, like a paragraph break
      blocks.push({ k: "p", text: "" });
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ k: "h3", text: line.slice(4) });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ k: "h2", text: line.slice(3) });
      continue;
    }
    if (isTableLine(line)) {
      const rows: string[][] = [];
      let head: string[] | null = null;
      let j = i;
      while (j < lines.length && isTableLine(lines[j])) {
        if (isTableRule(lines[j])) {
          if (rows.length === 1 && !head) head = rows.pop()!;
        } else {
          rows.push(tableCells(lines[j]));
        }
        j++;
      }
      blocks.push({ k: "table", head, rows });
      i = j - 1;
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      const prev = last();
      if (prev?.k === "ol") prev.items.push({ n: numbered[1], text: numbered[2] });
      else blocks.push({ k: "ol", items: [{ n: numbered[1], text: numbered[2] }] });
      continue;
    }
    const trimmed = line.trimStart();
    const bullet = /^\*\s+/.test(line)
      ? line.replace(/^\*\s+/, "")
      : trimmed.startsWith("- ")
        ? trimmed.slice(2)
        : null;
    if (bullet !== null) {
      const prev = last();
      if (prev?.k === "ul") prev.items.push(bullet);
      else blocks.push({ k: "ul", items: [bullet] });
      continue;
    }
    blocks.push({ k: "p", text: line });
  }

  const out = blocks.filter((b) => !(b.k === "p" && !b.text));
  return (
    <div className="ss-md">
      {out.map((b, idx) => {
        if (b.k === "h3")
          return <h3 key={idx} className="ss-h3" dangerouslySetInnerHTML={{ __html: toHtml(b.text) }} />;
        if (b.k === "h2")
          return <h2 key={idx} className="ss-h2" dangerouslySetInnerHTML={{ __html: toHtml(b.text) }} />;
        if (b.k === "ul")
          return (
            <ul key={idx}>
              {b.items.map((it, n) => (
                <li key={n}>
                  <span dangerouslySetInnerHTML={{ __html: toHtml(it) }} />
                </li>
              ))}
            </ul>
          );
        if (b.k === "ol")
          return (
            <ol key={idx}>
              {b.items.map((it, n) => (
                <li key={n}>
                  <span className="ss-ol__n" aria-hidden="true">
                    {it.n}.
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: toHtml(it.text) }} />
                </li>
              ))}
            </ol>
          );
        if (b.k === "table") {
          const cols = Math.max(b.head?.length ?? 0, ...b.rows.map((r) => r.length));
          const numeric = Array.from({ length: cols }, (_, c) => {
            const cells = b.rows.map((r) => r[c] ?? "").filter((v) => v.trim());
            return cells.length > 0 && cells.every(isNumericCell);
          });
          return (
            <div key={idx} className="ss-table">
              <table>
                {b.head ? (
                  <thead>
                    <tr>
                      {b.head.map((c, n) => (
                        <th
                          key={n}
                          scope="col"
                          className={numeric[n] ? "n" : undefined}
                          dangerouslySetInnerHTML={{ __html: toHtml(c) }}
                        />
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {b.rows.map((r, rn) => (
                    <tr key={rn}>
                      {r.map((c, n) => (
                        <td
                          key={n}
                          className={numeric[n] ? "n" : undefined}
                          dangerouslySetInnerHTML={{ __html: toHtml(c) }}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={idx} dangerouslySetInnerHTML={{ __html: toHtml(b.text) }} />;
      })}
    </div>
  );
}

/**
 * Small mark after a section title in the screener sidebar report: the Golden Report badge on
 * Team Updates and the X glyph on Top Tweets. Other sections stay plain, like the prototype.
 */
export function screenerReportSectionBadge(title: string): React.ReactNode {
  const t = title.toLowerCase();
  if (t.includes("team updates"))
    return (
      <span className="ss-sec__badge">
        <Image src="/images/golden-report-badge.webp" alt="Golden Report" width={22} height={22} />
      </span>
    );
  if (t.includes("individual tweets") || t.includes("top tweets"))
    return (
      <span className="ss-sec__badge" aria-hidden="true">
        <svg width={15} height={15} viewBox="0 0 14 14" fill="none">
          <path
            d="M11.025 0.65625H13.172L8.482 6.03025L14 13.3442H9.68L6.294 8.90925L2.424 13.3442H0.275L5.291 7.59425L0 0.65725H4.43L7.486 4.71025L11.025 0.65625ZM10.27 12.0562H11.46L3.78 1.87725H2.504L10.27 12.0562Z"
            fill="currentColor"
          />
        </svg>
      </span>
    );
  return null;
}

export function getRexPilotReportSectionIcon(title: string): React.ReactNode {
  const t = title.toLowerCase();
  if (t.includes("what it is"))
    return (
      <Image src={"/images/leaf.png"} alt="leaf" width={25} height={25} />
    );
  if (t.includes("team updates"))
    return (
      <Image
        src="/images/golden-report-badge.webp"
        alt="Golden Report"
        width={28}
        height={28}
        className="shrink-0 object-contain"
      />
    );
  if (t.includes("community chatter"))
    return (
      <Image
        src={"/images/communitychatter.png"}
        alt="community"
        width={35}
        height={35}
      />
    );
  if (t.includes("individual tweets") || t.includes("top tweets"))
    return (
      <svg
        width={25}
        height={25}
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 text-white"
        aria-hidden
      >
        <path
          d="M11.025 0.65625H13.172L8.482 6.03025L14 13.3442H9.68L6.294 8.90925L2.424 13.3442H0.275L5.291 7.59425L0 0.65725H4.43L7.486 4.71025L11.025 0.65625ZM10.27 12.0562H11.46L3.78 1.87725H2.504L10.27 12.0562Z"
          fill="currentColor"
        />
      </svg>
    );
  if (t.includes("coin-o-metry"))
    return (
      <Image
        src={"/images/coinmetry.png"}
        alt="coinometry"
        width={35}
        height={35}
      />
    );
  if (t.includes("holder analytics")) return "💎";
  if (t.includes("safety analytics"))
    return (
      <svg
        className="w-6 h-6 text-[#ffc000]"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  if (t.includes("technical analysis")) return "📈";
  return "📄";
}
