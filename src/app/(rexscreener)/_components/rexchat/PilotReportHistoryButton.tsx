"use client";

type Props = {
  /** Saved reports; shown as a small count next to the label. */
  count: number;
  onOpen: () => void;
  className?: string;
  /** "icon": square clock button for pane headers (design/market.html News intelligence head). */
  variant?: "button" | "icon";
};

/**
 * Opens the Report history drawer. Prototype's History control (token.html #histBtn):
 * secondary button with a clock; 40px tall on phones so it is an easy tap.
 */
export function PilotReportHistoryButton({
  count,
  onOpen,
  className = "",
  variant = "button",
}: Props) {
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`rx-icon-btn panel-ctl ${className}`}
        aria-label={
          count > 0
            ? `Report history, ${count} saved`
            : "Report history"
        }
        title="Report history"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rx-btn rx-btn--secondary rx-btn--s max-md:h-10 max-md:px-3.5 max-md:text-[13px] ${className}`}
      aria-label={
        count > 0
          ? `View report history, ${count} saved`
          : "View report history"
      }
      title="Report history"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 8v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Report history
      {count > 0 ? (
        <span className="rx-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}
