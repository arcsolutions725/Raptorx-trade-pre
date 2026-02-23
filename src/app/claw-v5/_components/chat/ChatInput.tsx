"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Globe,
  Mic,
  Paperclip,
  PenLine,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import Image from "next/image";

export type PredictionMarketMode = "Auto" | "Kalshi" | "Polymarket";

const DEFAULT_PLACEHOLDER =
  "Search Prediction Events, Arbitrage, Wallets, Cryptocurrencies and more!";

const PLACEHOLDER_BY_MODE: Record<PredictionMarketMode, string> = {
  Auto: DEFAULT_PLACEHOLDER,
  Kalshi: "Ask Claw any prediction question or event related to Kalshi",
  Polymarket: "Ask Claw any prediction question or event related to Polymarket",
};

interface ChatInputProps {
  onSendMessage: (message: string, quotedContent?: string) => void;
  isLoading?: boolean;
  onStop?: () => void;
  placeholder?: string;
  quotedContent?: string;
  onClearQuote?: () => void;
  prefillText?: string;
  marketMode?: PredictionMarketMode;
  onMarketModeChange?: (mode: PredictionMarketMode) => void;
}

const CHAT_CONTENT_MAX_WIDTH = "max-w-3xl";
// UI feature flags (keep code, hide UI)
const SHOW_CREATE_ARTIFACT = false;
const SHOW_TOOLBAR = true;

export default function ChatInput({
  onSendMessage,
  isLoading = false,
  onStop,
  placeholder: _placeholderProp,
  quotedContent,
  onClearQuote,
  prefillText,
  marketMode: controlledMode,
  onMarketModeChange,
}: ChatInputProps) {
  const [internalMode, setInternalMode] =
    useState<PredictionMarketMode>("Auto");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const marketMode = controlledMode ?? internalMode;
  const setMarketMode = onMarketModeChange ?? setInternalMode;
  // Placeholder is driven by selected market (Kalshi/Polymarket); prop is ignored for this input
  const placeholder = PLACEHOLDER_BY_MODE[marketMode];

  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastPrefillRef = useRef<string | undefined>(undefined);

  // Position dropdown above trigger when opening (for portal)
  useEffect(() => {
    if (!dropdownOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.top - 4,
      left: rect.left,
    });
  }, [dropdownOpen]);

  // Close dropdown when generating response
  useEffect(() => {
    if (isLoading) setDropdownOpen(false);
  }, [isLoading]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isLoading) {
      onSendMessage(message.trim(), quotedContent);
      setMessage("");
      if (onClearQuote) {
        onClearQuote();
      }
    }
  };

  // Auto-size textarea (up to a max height) for a nicer "composer" feel.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 140);
    el.style.height = `${Math.max(next, 56)}px`;
  }, [message]);

  // Allow parent to prefill the composer (used for landing-page sample prompts).
  // Replaces current composer text when a new prefill arrives (sample prompt click UX).
  useEffect(() => {
    const next = (prefillText || "").trim();
    if (!next) return;

    // Avoid re-applying the same prefill on re-renders.
    if (lastPrefillRef.current === next) {
      // Still focus to match "click card -> start typing" UX.
      textareaRef.current?.focus();
      return;
    }

    // Replace current text with the new prefill.
    setMessage(next);
    lastPrefillRef.current = next;
    // Focus after state commit.
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [prefillText, message]);

  return (
    <div className="bg-black p-3 md:p-4 flex flex-col items-center gap-2">
      {/* Quoted Content Display */}
      {quotedContent && (
        <div
          className={`${CHAT_CONTENT_MAX_WIDTH} w-full bg-[#0f0f0f] border border-white/10 rounded-2xl p-3 md:p-4 relative`}
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#737373] mb-1">Quoted message:</div>
              <div className="text-xs md:text-sm text-white/80 line-clamp-2 break-words">
                {quotedContent}
              </div>
            </div>
            {onClearQuote && (
              <button
                type="button"
                onClick={onClearQuote}
                className="flex-shrink-0 p-1 hover:bg-[#2a2a2a] rounded transition-colors touch-manipulation"
                aria-label="Remove quote"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`relative ${CHAT_CONTENT_MAX_WIDTH} w-full`}
      >
        {/* Composer */}
        <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.02)] overflow-visible focus-within:border-[#FFC000]/40 focus-within:shadow-[0_0_0_3px_rgba(255,192,0,0.12)] transition-[border-color,box-shadow]">
          {/* Top action (purely UI for now) */}
          {SHOW_CREATE_ARTIFACT && (
            <div className="px-4 pt-3 pb-1">
              <button
                type="button"
                className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-white/70 transition-colors"
                aria-label="Create artifact"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-white/50"
                >
                  <path
                    d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M7 9h10M7 13h7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span>Create Artifact...</span>
              </button>
            </div>
          )}

          {/* Textarea */}
          <div className="px-4 pt-2">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (
                    e.currentTarget.form as HTMLFormElement | null
                  )?.requestSubmit();
                }
              }}
              placeholder={placeholder}
              disabled={isLoading}
              rows={1}
              className="w-full bg-transparent text-white/90 placeholder-white/35 pb-2 pt-1 focus:outline-none disabled:opacity-50 text-sm md:text-base resize-none overflow-y-auto min-h-[56px] max-h-[140px] custom-chat-input-scrollbar"
              aria-label="Message"
            />
          </div>

          {/* Toolbar */}
          <div className="px-3 pb-2 pt-0.5 flex items-center justify-between gap-3">
            {SHOW_TOOLBAR ? (
              <div className="flex items-center gap-1 text-white/70">
                {/* <button
                  type="button"
                  className="h-8 w-8 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center"
                  aria-label="Attach"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center"
                  aria-label="Edit"
                >
                  <PenLine className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center"
                  aria-label="Voice"
                >
                  <Mic className="w-4 h-4" />
                </button> */}

                {/* <div className="mx-1 h-5 w-px bg-white/10" /> */}

                <div className="relative">
                  <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => {
                      if (isLoading) return;
                      setDropdownOpen((open) => !open);
                    }}
                    disabled={isLoading}
                    className="h-8 px-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors inline-flex items-center gap-1 text-xs disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
                    aria-label="Prediction market"
                    aria-expanded={dropdownOpen}
                    aria-haspopup="listbox"
                  >
                    <SlidersHorizontal
                      className="w-4 h-4 text-white/60"
                      aria-hidden
                    />
                    {marketMode === "Kalshi" && (
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center bg-[#17cb91] text-white text-xs font-bold shrink-0"
                        aria-hidden
                      >
                        K
                      </span>
                    )}
                    {marketMode === "Polymarket" && (
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center bg-[#2C59F7] p-0.5 shrink-0"
                        aria-hidden
                      >
                        <Image
                          src="/images/polymarket.png"
                          alt=""
                          width={16}
                          height={16}
                          className="w-4 h-4 object-contain"
                        />
                      </span>
                    )}
                    <span className="text-white/70">{marketMode}</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-white/50 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {dropdownOpen &&
                    createPortal(
                      <div
                        ref={dropdownRef}
                        className="fixed min-w-[140px] py-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-lg z-[9999]"
                        role="listbox"
                        style={{
                          top: dropdownPosition.top,
                          left: dropdownPosition.left,
                          transform: "translateY(-100%)",
                        }}
                      >
                        {(["Auto", "Kalshi", "Polymarket"] as const).map(
                          (option) => (
                            <button
                              key={option}
                              type="button"
                              role="option"
                              aria-selected={marketMode === option}
                              onClick={() => {
                                setMarketMode(option);
                                setDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between gap-2 ${
                                marketMode === option
                                  ? "bg-white/10 text-white"
                                  : "text-white/80 hover:bg-white/5 hover:text-white"
                              }`}
                            >
                              <span className="flex items-center gap-2 shrink-0">
                                {option === "Auto" && (
                                  <SlidersHorizontal
                                    className="w-4 h-4 text-white/60"
                                    aria-hidden
                                  />
                                )}
                                {option === "Kalshi" && (
                                  <span
                                    className="w-5 h-5 rounded flex items-center justify-center bg-[#17cb91] text-white text-xs font-bold"
                                    aria-hidden
                                  >
                                    K
                                  </span>
                                )}
                                {option === "Polymarket" && (
                                  <span
                                    className="w-5 h-5 rounded flex items-center justify-center bg-[#2C59F7] p-0.5"
                                    aria-hidden
                                  >
                                    <Image
                                      src="/images/polymarket.png"
                                      alt=""
                                      width={16}
                                      height={16}
                                      className="w-4 h-4 object-contain"
                                    />
                                  </span>
                                )}
                                <span>{option}</span>
                              </span>
                              {marketMode === option && (
                                <span
                                  className="text-[#FFC000] shrink-0"
                                  aria-hidden
                                >
                                  ✓
                                </span>
                              )}
                            </button>
                          ),
                        )}
                      </div>,
                      document.body,
                    )}
                </div>
                {/* <button
                  type="button"
                  className="h-8 w-8 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors flex items-center justify-center"
                  aria-label="Web"
                >
                  <Globe className="w-4 h-4" />
                </button> */}
              </div>
            ) : (
              <div />
            )}

            {isLoading && onStop ? (
              <button
                type="button"
                onClick={onStop}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="w-4 h-4 fill-current text-white" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!message.trim() || isLoading}
                className="h-9 w-9 md:h-10 md:w-10 active:bg-white/10 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send message"
                title="Send (Enter)"
              >
                <div className="relative w-7 h-7 md:w-9 md:h-9">
                  <Image
                    src="/images/claw_banner.png"
                    alt="Send"
                    fill
                    className="object-contain"
                  />
                </div>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
