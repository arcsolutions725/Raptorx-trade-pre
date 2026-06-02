"use client";

type Props = {
  /** Used only for accessibility; not shown in the UI. */
  count: number;
  onOpen: () => void;
  className?: string;
};

export function PilotReportHistoryButton({
  count,
  onOpen,
  className = "",
}: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${className}`}
      aria-label={
        count > 0
          ? `View report history, ${count} saved`
          : "View report history"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/history.webp"
        alt=""
        width={112}
        height={112}
        decoding="async"
        className="block h-12 w-24 shrink-0 object-contain"
      />
    </button>
  );
}
