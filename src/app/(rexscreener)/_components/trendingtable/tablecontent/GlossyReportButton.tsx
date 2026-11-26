"use client";

import clsx from "clsx";

type GlossyButtonProps = {
  label: string;
  variant: "full-report" | "whats-new";
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  /** What's New request in flight: the bolt turns into a spinner. */
  loading?: boolean;
  /** Antique-gold Full Report (screener rows, report cards). Default is the dark token-bar style. */
  gold?: boolean;
  className?: string;
};

/**
 * Full Report / What's New (RaptorX design `.rx-btn--report` / `.rx-btn--news`): the token bar
 * uses the dark report style with the white 3D report emoji; rows and cards use the gold style with
 * the black report mark. What's New carries the 3D lightning bolt.
 */
export function GlossyReportButton({
  label,
  variant,
  onClick,
  disabled = false,
  ariaLabel,
  loading = false,
  gold = false,
  className,
}: GlossyButtonProps) {
  const report = variant === "full-report";
  const icon = report
    ? gold
      ? "/images/emoji/report-ink.svg"
      : "/images/emoji/report.webp"
    : "/images/emoji/bolt.webp";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={label}
      className={clsx(
        "rx-btn rx-btn--s font-bold hover:-translate-y-px disabled:translate-none",
        report ? "rx-btn--report" : "rx-btn--news",
        report && gold && "rx-btn--gold disabled:filter-none",
        className,
      )}
    >
      {loading ? (
        <span className="rx-spin size-3 border-[1.5px]" aria-hidden />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={clsx("rx-emo", report && gold && "rx-emo--ink")}
          src={icon}
          alt=""
          width={16}
          height={16}
        />
      )}
      {label}
    </button>
  );
}
