"use client";

/**
 * Phones, token view: the bar above the tab bar — "Intelligence report | Trade SYM" (prototype
 * design/token.html .tk-mbar). Each button opens that pane of the sidebar as a bottom sheet.
 * Styles: styles/pages/screener-side.css (.rx-screener .rx-tk-mbar); hidden from 768px up.
 */

import { IconDoc } from "@/app/rexmarkets/_components/RexMarketsReport/RexMarketsReportData/pilotUi";
import { IconSwap } from "@/app/(rexscreener)/_components/rexchat/screenerSideUi";

export type SheetPane = "report" | "exchange";

export function TokenPhoneBar({
  symbol,
  openPane,
  controls,
  onOpen,
}: {
  /** Token symbol for "Trade SYM" */
  symbol?: string | null;
  /** The sheet that is open now (null: none) */
  openPane: SheetPane | null;
  /** id of the sidebar the sheets live in */
  controls: string;
  onOpen: (pane: SheetPane) => void;
}) {
  const sym = (symbol ?? "").trim();
  return (
    <div className="rx-tk-mbar" role="group" aria-label="Report and trade">
      <button
        type="button"
        className="rx-btn rx-btn--report"
        onClick={() => onOpen("report")}
        aria-haspopup="dialog"
        aria-controls={controls}
        aria-expanded={openPane === "report"}
      >
        <span className="rx-tk-mbar__doc" aria-hidden="true">
          <IconDoc size={14} />
        </span>
        Intelligence report
      </button>
      <button
        type="button"
        className="rx-btn rx-btn--primary"
        onClick={() => onOpen("exchange")}
        aria-haspopup="dialog"
        aria-controls={controls}
        aria-expanded={openPane === "exchange"}
        title={sym ? `Trade ${sym}` : "Trade"}
      >
        <IconSwap size={14} />
        <span className="rx-tk-mbar__sym">{sym ? `Trade ${sym}` : "Trade"}</span>
      </button>
    </div>
  );
}
