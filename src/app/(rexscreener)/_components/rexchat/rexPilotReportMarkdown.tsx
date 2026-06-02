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
