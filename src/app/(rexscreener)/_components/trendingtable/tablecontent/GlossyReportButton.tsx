"use client";

import Image from "next/image";

type GlossyButtonProps = {
  label: string;
  variant: "full-report" | "whats-new";
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
};

const BUTTON_ART = {
  "full-report": {
    src: "/images/full-report-transparent.png",
    width: 100,
    height: 40,
  },
  "whats-new": {
    src: "/images/whats-new-transparent.png",
    width: 100,
    height: 40,
  },
} as const;

/**
 * Same slot as the previous Generate control (`w-17.5 h-7.5`).
 */
export function GlossyReportButton({
  label,
  variant,
  onClick,
  disabled = false,
  ariaLabel,
}: GlossyButtonProps) {
  const art = BUTTON_ART[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={label}
      className={`relative flex h-7.5 w-17.5 shrink-0 items-center justify-center bg-transparent p-0 transition ${
        disabled
          ? "cursor-wait opacity-60"
          : "cursor-pointer hover:scale-[1.05] active:scale-[0.98]"
      }`}
      style={{ flexShrink: 0 }}
    >
      <Image
        src={art.src}
        alt={label}
        width={art.width}
        height={art.height}
        className="h-full w-full object-contain"
      />
    </button>
  );
}
