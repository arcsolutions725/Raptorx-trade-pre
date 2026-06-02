"use client";

import type React from "react";
import { CoinOMetry } from "@/components/CoinOMetry";
import type { DexScreenerPair } from "@/lib/api/dexscreener";
import {
  displayReportSectionTitle,
  type RexReportSection,
} from "@/lib/reportToc";
import {
  getRexPilotReportSectionIcon,
  renderRexPilotMarkdownSection,
} from "./rexPilotReportMarkdown";

type RexPilotReportSectionsStreamProps = {
  sections: RexReportSection[];
  /** When set, Coin-O-Metry section uses the live embed (matches post-save report). */
  dexData?: DexScreenerPair | null;
  isBNBToken: boolean;
  /** Typing caret after the final section while SSE is active */
  showTrailingCaret?: boolean;
};

/**
 * RexScreener in-flight report: same section chrome + body styles as ChatInterface,
 * without DB-backed tweets / BNB analytics widgets (markdown only until report is saved).
 */
export function RexPilotReportSectionsStream({
  sections,
  dexData,
  isBNBToken,
  showTrailingCaret = false,
}: RexPilotReportSectionsStreamProps) {
  function renderBody(title: string, lines: string[]): React.ReactNode {
    const t = title.toLowerCase();
    const body = lines.join("\n");

    if (t.includes("coin-o-metry") && dexData) {
      return <CoinOMetry dexData={dexData} />;
    }

    if (
      (t.includes("holder analytics") || t.includes("safety analytics")) &&
      !isBNBToken
    ) {
      return null;
    }

    return renderRexPilotMarkdownSection(body);
  }

  return (
    <div className="space-y-8">
      {sections.map(({ title, body, id }, i) => {
        const isLast = i === sections.length - 1;
        const inner = renderBody(title, body);

        return (
          <div key={id} id={id} className="scroll-mt-24">
            <h2 className="rex-pilot-section-heading mb-4 flex items-center gap-3">
              {displayReportSectionTitle(title)}
              {getRexPilotReportSectionIcon(title)}
            </h2>
            <div className="space-y-3">
              {inner}
              {isLast && showTrailingCaret ? (
                <span
                  className="inline-block w-2 h-4 bg-[#ffc000]/85 animate-pulse ml-0.5 align-middle"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
