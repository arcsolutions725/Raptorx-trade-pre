"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
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
  searchable?: boolean;
  searchPlaceholder?: string;
}

function filterOptions(options: SelectOption[], query: string): SelectOption[] {
  if (!query.trim()) return options;
  const q = query.trim().toLowerCase();
  return options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      opt.value.toLowerCase().includes(q),
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
  direction = "down",
  searchable = false,
  searchPlaceholder = "Search options...",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const selectRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(
    () => filterOptions(options, searchQuery),
    [options, searchQuery],
  );

  const selectedOption = options.find((opt) => opt.value === value);
  const [activeIndex, setActiveIndex] = useState(
    Math.max(
      0,
      filteredOptions.findIndex((opt) => opt.value === value),
    ),
  );

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      if (searchable) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        requestAnimationFrame(() => listRef.current?.focus());
      }
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    const idx = filteredOptions.findIndex((opt) => opt.value === value);
    if (idx >= 0) setActiveIndex(idx);
    else setActiveIndex(0);
  }, [value, filteredOptions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isOpen) return;
      if (searchable && searchQuery) {
        setSearchQuery("");
        searchInputRef.current?.focus();
      } else {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, searchable, searchQuery]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setSearchQuery("");
    setIsOpen(false);
  };

  const commit = (idx: number) => {
    const selected = filteredOptions[idx];
    if (selected) handleSelect(selected.value);
  };

  const onKeyDownButton = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(true);
      if (searchable) {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else {
        requestAnimationFrame(() => listRef.current?.focus());
      }
    }
  };

  const onKeyDownList = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (searchable && searchQuery) {
        setSearchQuery("");
        searchInputRef.current?.focus();
      } else {
        setIsOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions.length > 0) commit(activeIndex);
      return;
    }
  };

  const onKeyDownSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (searchQuery) {
        setSearchQuery("");
      } else {
        setIsOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      listRef.current?.focus();
      setActiveIndex((i) =>
        Math.min(filteredOptions.length - 1, Math.max(0, i)),
      );
      return;
    }
    if (e.key === "Enter" && filteredOptions.length > 0) {
      e.preventDefault();
      commit(activeIndex);
      return;
    }
  };

  const popPos = direction === "up" ? "bottom-full mb-2" : "top-full mt-2";

  return (
    <div ref={selectRef} className={clsx("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={onKeyDownButton}
        disabled={disabled}
        className={clsx(
          "flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-md border border-white/20 bg-black/30 transition text-white",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer",
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
            "size-4 opacity-80 transition shrink-0",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div
          className={clsx(
            "absolute z-50",
            popPos,
            "left-0 w-full min-w-50 max-w-[min(100vw,320px)] rounded-lg border border-white/15 bg-[#0A0A0A] overflow-hidden",
          )}
        >
          {searchable && (
            <div className="p-2 border-b border-white/10 sticky top-0 bg-[#0A0A0A]/95">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 border border-white/10">
                <Search className="size-4 text-white/50 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={onKeyDownSearch}
                  placeholder={searchPlaceholder}
                  className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
                  aria-label="Search options"
                />
              </div>
            </div>
          )}
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              filteredOptions[activeIndex]
                ? `select-opt-${filteredOptions[activeIndex].value}`
                : undefined
            }
            onKeyDown={onKeyDownList}
            className={clsx(
              "max-h-60 overflow-auto custom-select-scrollbar",
              searchable && "max-h-52",
            )}
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-4 text-sm text-white/50 text-center">
                No options match &quot;{searchQuery}&quot;
              </li>
            ) : (
              filteredOptions.map((option, idx) => {
                const selected = option.value === value;
                const active = idx === activeIndex;
                return (
                  <li
                    key={option.value}
                    id={`select-opt-${option.value}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => commit(idx)}
                    className={clsx(
                      "flex items-center justify-between gap-3 cursor-pointer px-3 py-2 text-sm",
                      active && "bg-white/10",
                      selected ? "text-[#FFD700]" : "text-white/90",
                      "hover:bg-white/10",
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected ? (
                      <Check className="size-4 shrink-0" />
                    ) : (
                      <span className="size-4 shrink-0" />
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
