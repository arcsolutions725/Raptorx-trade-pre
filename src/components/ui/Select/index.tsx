"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import clsx from "clsx";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  direction?: "up" | "down";
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
  direction = "down",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(
    Math.max(0, options.findIndex((opt) => opt.value === value))
  );
  const selectRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Ensure activeIndex follows current value
  useEffect(() => {
    const idx = options.findIndex((opt) => opt.value === value);
    if (idx >= 0) setActiveIndex(idx);
  }, [value, options]);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const commit = (idx: number) => {
    const selected = options[idx];
    if (selected) handleSelect(selected.value);
  };

  const onKeyDownButton = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
      requestAnimationFrame(() => listRef.current?.focus());
    }
  };

  const onKeyDownList = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit(activeIndex);
      return;
    }
  };

  const popPos = direction === "up" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div ref={selectRef} className={clsx("relative", className)}>
      {/* Select Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={onKeyDownButton}
        disabled={disabled}
        className={clsx(
          "flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-md border border-white/20 bg-black/30 hover:bg-white/10 transition text-white",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectedOption?.label || placeholder}
      >
        <span className="text-sm truncate flex-1 text-left">
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={clsx(
            "size-4 opacity-80 transition flex-shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`select-opt-${activeIndex}`}
          onKeyDown={onKeyDownList}
          className={clsx(
            "absolute z-50",
            popPos,
            "left-0 w-full min-w-[160px] max-h-60 overflow-auto rounded-lg border border-white/15 bg-[#0A0A0A]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0A0A0A]/70 shadow-2xl custom-select-scrollbar"
          )}
        >
          {options.map((option, idx) => {
            const selected = option.value === value;
            const active = idx === activeIndex;
            return (
              <li
                key={option.value}
                id={`select-opt-${idx}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
                className={clsx(
                  "flex items-center justify-between gap-3 cursor-pointer px-3 py-2 text-sm",
                  active && "bg-white/10",
                  selected ? "text-[#FFD700]" : "text-white/90",
                  "hover:bg-white/10"
                )}
              >
                <span className="truncate">{option.label}</span>
                {selected ? (
                  <Check className="size-4 flex-shrink-0" />
                ) : (
                  <span className="size-4 flex-shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

