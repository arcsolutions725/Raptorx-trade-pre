"use client";

import type React from "react";
import { CoinOMetry } from "@/components/CoinOMetry";
import type { DexScreenerPair } from "@/lib/api/dexscreener";
import {
  displayReportSectionTitle,
  type RexReportSection,
} from "@/lib/reportToc";
import {
  renderScreenerReportMarkdown,
  screenerReportSectionBadge,
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
 * Styles: styles/pages/screener-side.css (.ss-report, .ss-sec, .ss-md).
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

    return renderScreenerReportMarkdown(body);
  }

  return (
    <div className="ss-report">
      {sections.map(({ title, body, id }, i) => {
        const isLast = i === sections.length - 1;
        const inner = renderBody(title, body);
        const gold = title.toLowerCase().includes("team updates");

        return (
          <section key={id} id={id} className={`ss-sec${gold ? " ss-sec--gold" : ""}`}>
            <h2 className="ss-sec__title">
              {displayReportSectionTitle(title)}
              {screenerReportSectionBadge(title)}
            </h2>
            <div className="ss-sec__body">
              {inner}
              {isLast && showTrailingCaret ? (
                <span className="ss-caret" aria-hidden="true" />
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
