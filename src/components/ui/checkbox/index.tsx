"use client";

import { useCallback, useRef } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** "sm" keeps the control compact (e.g. for chart legends). Default is normal size. */
  size?: "default" | "sm";
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
  id,
  size = "default",
}: CheckboxProps) {
  const lastToggleAtRef = useRef(0);

  const commitToggle = useCallback(() => {
    if (disabled) return;
    const now = Date.now();
    if (now - lastToggleAtRef.current < 350) return;
    lastToggleAtRef.current = now;
    onChange(!checked);
  }, [disabled, checked, onChange]);

  const isSm = size === "sm";

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <span
        className={clsx(
          "inline-flex items-center justify-center shrink-0 touch-manipulation",
          // iOS needs ~44×44pt targets; keep visual size with padding + negative margin.
          isSm && "p-[14px] -m-[14px]",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={commitToggle}
          onTouchEnd={(e) => {
            e.preventDefault();
            commitToggle();
          }}
          disabled={disabled}
          id={id}
          style={{ WebkitTapHighlightColor: "transparent" }}
          className={clsx(
            "flex items-center justify-center rounded border-2 transition-all shrink-0 touch-manipulation",
            isSm ? "w-4 h-4" : "w-5 h-5",
            checked
              ? "bg-[#ffc000] border-[#ffc000]"
              : "bg-transparent border-white/30 active:border-white/50",
            disabled && "opacity-50 cursor-not-allowed",
            !disabled && "cursor-pointer",
          )}
        >
          {checked && (
            <Check
              className={clsx("text-black stroke-3", isSm ? "w-2.5 h-2.5" : "w-3.5 h-3.5")}
            />
          )}
        </button>
      </span>
      {label && (
        <label
          htmlFor={id}
          className={clsx(
            "text-sm text-gray-300 cursor-pointer select-none",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          onClick={commitToggle}
        >
          {label}
        </label>
      )}
    </div>
  );
}
