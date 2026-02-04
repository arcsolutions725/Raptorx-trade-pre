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
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
  id,
}: CheckboxProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

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
          "flex items-center justify-center w-5 h-5 rounded border-2 transition-all",
          checked
            ? "bg-[#ffc000] border-[#ffc000]"
            : "bg-transparent border-white/30 hover:border-white/50",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer"
        )}
      >
        {checked && (
          <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
        )}
      </button>
      {label && (
        <label
          htmlFor={id}
          className={clsx(
            "text-sm text-gray-300 cursor-pointer select-none",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={handleClick}
        >
          {label}
        </label>
      )}
    </div>
  );
}

