"use client";

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
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const isSm = size === "sm";

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={handleClick}
        disabled={disabled}
        id={id}
        className={clsx(
          "flex items-center justify-center rounded border-2 transition-all shrink-0",
          isSm ? "w-4 h-4" : "w-5 h-5",
          checked
            ? "bg-[#ffc000] border-[#ffc000]"
            : "bg-transparent border-white/30 hover:border-white/50",
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
      {label && (
        <label
          htmlFor={id}
          className={clsx(
            "text-sm text-gray-300 cursor-pointer select-none",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          onClick={handleClick}
        >
          {label}
        </label>
      )}
    </div>
  );
}
