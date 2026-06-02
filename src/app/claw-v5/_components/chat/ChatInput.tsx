"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, SlidersHorizontal, Square, X } from "lucide-react";
import Image from "next/image";

export type PredictionMarketMode =
  | "Markets"
  | "Crypto"
  | "Kalshi"
  | "Polymarket";

const DEFAULT_PLACEHOLDER =
  "Search Prediction Events, Arbitrage, Wallets, Cryptocurrencies and more!";

const PLACEHOLDER_BY_MODE: Record<PredictionMarketMode, string> = {
  Markets: DEFAULT_PLACEHOLDER,
  Crypto: "Ask Claw about crypto, indicators, technical analysis and more!",
  Kalshi: "Ask Claw any prediction question or event related to Kalshi",
  Polymarket: "Ask Claw any prediction question or event related to Polymarket",
};

const LABEL_BY_MODE: Record<PredictionMarketMode, string> = {
  Markets: "Internet Markets",
  Crypto: "Crypto",
  Kalshi: "Prediction Markets",
  Polymarket: "Prediction Markets",
};

const CRYPTO_CHAIN_LABEL: Record<
  "solana" | "ethereum" | "base" | "bnb" | "monad",
  string
> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  bnb: "BNB",
  monad: "Monad",
};

export type PredictionSubmode =
  | "polymarket"
  | "kalshi"
  | "limitless"
  | "myriad"
  | "predictfun";

const PREDICTION_SUBMODE_LABEL: Record<PredictionSubmode, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  limitless: "Limitless",
  myriad: "Myriad",
  predictfun: "Predict.fun",
};

/** Sub-modes under Internet Markets that scope Claw to one prediction venue. */
function isMarketsModeProvider(
  sub: PredictionSubmode,
): sub is "limitless" | "myriad" | "predictfun" {
  return sub === "limitless" || sub === "myriad" || sub === "predictfun";
}

/** Placeholder text per selection. */
const PLACEHOLDER_INTERNET_MARKETS =
  "Search prediction events, arbitrage, wallets, cryptocurrencies and more!";
const PLACEHOLDER_CRYPTO =
  "Ask Claw about crypto, indicators, technical analysis and more!";
const PLACEHOLDER_SOLANA =
  "Ask about Solana tokens, DEXs, momentum, or technicals (e.g. $SOL 15m MACD)...";
const PLACEHOLDER_BASE =
  "Ask about Base chain tokens, DEXs, momentum, or technicals...";
const PLACEHOLDER_BNB =
  "Ask about BNB chain tokens, DEXs, momentum, or technicals...";
const PLACEHOLDER_MONAD =
  "Ask about Monad tokens, DEXs, momentum, or technicals (e.g. $MON/USDC on Octoswap)...";
const PLACEHOLDER_ETHEREUM =
  "Ask about Ethereum tokens, DEXs, momentum, or technicals...";
const PLACEHOLDER_PREDICTION_MARKETS =
  "Ask about prediction markets across Polymarket, Kalshi, Limitless, Myriad, and Predict.fun...";
const PLACEHOLDER_POLYMARKET =
  "Ask Claw any prediction question or event related to Polymarket";
const PLACEHOLDER_KALSHI =
  "Ask Claw any prediction question or event related to Kalshi";
const PLACEHOLDER_LIMITLESS =
  "Ask about Limitless market, events, odds, and trading on Limitless...";
const PLACEHOLDER_MYRIAD =
  "Ask about Myriad markets, events, odds, and trading on Myriad...";
const PLACEHOLDER_PREDICTFUN =
  "Ask about Predict.fun markets, events, odds, and trading on Predict.fun...";

export type ClawSelectionContext = {
  cryptoChain?: "solana" | "ethereum" | "base" | "bnb" | "monad";
  predictionSubmode?: PredictionSubmode;
  predictionDisplayLevel?: "category" | "provider";
};

interface ChatInputProps {
  onSendMessage: (message: string, quotedContent?: string, context?: ClawSelectionContext) => void;
  isLoading?: boolean;
  onStop?: () => void;
  placeholder?: string;
  quotedContent?: string;
  onClearQuote?: () => void;
  prefillText?: string;
  marketMode?: PredictionMarketMode;
  onMarketModeChange?: (mode: PredictionMarketMode) => void;
  /** When true, disables the input and shows disabledPlaceholder. Use for auth-gated chat. */
  disabled?: boolean;
  /** Placeholder shown when disabled (e.g. "Sign in to chat"). */
  disabledPlaceholder?: string;
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
  disabled: disabledProp = false,
  disabledPlaceholder,
}: ChatInputProps) {
  const [internalMode, setInternalMode] =
    useState<PredictionMarketMode>("Markets");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const marketMode = controlledMode ?? internalMode;
  const setMarketMode = onMarketModeChange ?? setInternalMode;

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

  // Close when chat is auth-gated (same as textarea / send)
  useEffect(() => {
    if (disabledProp) setDropdownOpen(false);
  }, [disabledProp]);

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

  const isInputDisabled = isLoading || disabledProp;
  const [selectedCryptoChain, setSelectedCryptoChain] = useState<
    "solana" | "ethereum" | "base" | "bnb" | "monad"
  >("solana");
  const [selectedPredictionSubmode, setSelectedPredictionSubmode] =
    useState<PredictionSubmode>("polymarket");
  const [cryptoDisplayLevel, setCryptoDisplayLevel] = useState<
    "category" | "chain"
  >("chain");
  const [predictionDisplayLevel, setPredictionDisplayLevel] = useState<
    "category" | "provider"
  >("provider");

  const placeholder = (() => {
    if (disabledProp && disabledPlaceholder) return disabledPlaceholder;
    if (marketMode === "Crypto") {
      if (cryptoDisplayLevel === "category") return PLACEHOLDER_CRYPTO;
      if (selectedCryptoChain === "solana") return PLACEHOLDER_SOLANA;
      if (selectedCryptoChain === "ethereum") return PLACEHOLDER_ETHEREUM;
      if (selectedCryptoChain === "base") return PLACEHOLDER_BASE;
      if (selectedCryptoChain === "monad") return PLACEHOLDER_MONAD;
      return PLACEHOLDER_BNB;
    }
    if (marketMode === "Markets") {
      if (selectedPredictionSubmode === "limitless") return PLACEHOLDER_LIMITLESS;
      if (selectedPredictionSubmode === "myriad") return PLACEHOLDER_MYRIAD;
      if (selectedPredictionSubmode === "predictfun") return PLACEHOLDER_PREDICTFUN;
      return PLACEHOLDER_INTERNET_MARKETS;
    }
    if (marketMode === "Kalshi") {
      if (predictionDisplayLevel === "category") return PLACEHOLDER_PREDICTION_MARKETS;
      return PLACEHOLDER_KALSHI;
    }
    if (marketMode === "Polymarket") {
      if (predictionDisplayLevel === "category") return PLACEHOLDER_PREDICTION_MARKETS;
      return PLACEHOLDER_POLYMARKET;
    }
    return PLACEHOLDER_INTERNET_MARKETS;
  })();

  const collapsedLabel =
    marketMode === "Crypto"
      ? cryptoDisplayLevel === "category"
        ? "Crypto"
        : CRYPTO_CHAIN_LABEL[selectedCryptoChain]
      : marketMode === "Markets" && isMarketsModeProvider(selectedPredictionSubmode)
        ? predictionDisplayLevel === "category"
          ? "Prediction Markets"
          : PREDICTION_SUBMODE_LABEL[selectedPredictionSubmode]
        : marketMode === "Kalshi" || marketMode === "Polymarket"
          ? predictionDisplayLevel === "category"
            ? "Prediction Markets"
            : PREDICTION_SUBMODE_LABEL[selectedPredictionSubmode] ??
                LABEL_BY_MODE[marketMode]
          : LABEL_BY_MODE[marketMode];

  const collapsedCryptoIconSrc =
    selectedCryptoChain === "solana"
      ? "/images/solana.png"
      : selectedCryptoChain === "ethereum"
        ? "/images/ETH_light_logo.webp"
      : selectedCryptoChain === "base"
        ? "/images/base.png"
        : selectedCryptoChain === "monad"
          ? "/images/monad.png"
          : "/images/bnbchain.png";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (message.trim() && !isInputDisabled) {
      const context: ClawSelectionContext = {
        cryptoChain:
          marketMode === "Crypto" && cryptoDisplayLevel === "chain"
            ? selectedCryptoChain
            : undefined,
        predictionSubmode:
          (marketMode === "Polymarket" ||
            marketMode === "Kalshi" ||
            (marketMode === "Markets" &&
              isMarketsModeProvider(selectedPredictionSubmode))) &&
          predictionDisplayLevel === "provider"
            ? selectedPredictionSubmode
            : undefined,
        predictionDisplayLevel:
          marketMode === "Polymarket" ||
          marketMode === "Kalshi" ||
          (marketMode === "Markets" &&
            isMarketsModeProvider(selectedPredictionSubmode))
            ? predictionDisplayLevel
            : undefined,
      };
      onSendMessage(message.trim(), quotedContent, context);
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
    <div className="shrink-0 bg-black p-3 md:p-4 flex flex-col items-center gap-2">
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
              disabled={isInputDisabled}
              rows={1}
              className="w-full bg-transparent text-white/90 placeholder-white/35 pb-2 pt-1 focus:outline-none disabled:opacity-50 text-base resize-none overflow-y-auto min-h-[56px] max-h-[140px] custom-chat-input-scrollbar"
              aria-label="Message"
            />
          </div>

          {/* Toolbar */}
          <div className="px-3 pb-2 pt-0.5 flex items-center justify-between gap-3">
            {SHOW_TOOLBAR ? (
              <div className="flex items-center gap-3 text-white/70">
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
                      if (isInputDisabled) return;
                      setDropdownOpen((open) => !open);
                    }}
                    disabled={isInputDisabled}
                    className="h-8 px-2 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors inline-flex items-center gap-2 text-xs disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
                    aria-label="Prediction market"
                    aria-expanded={dropdownOpen}
                    aria-haspopup="listbox"
                  >
                    {/* Internet Markets / Limitless */}
                    {marketMode === "Markets" && (
                      <span
                        className="w-6 h-6 rounded flex items-center justify-center shrink-0 overflow-hidden"
                        aria-hidden
                      >
                        {selectedPredictionSubmode === "limitless" ? (
                          <span className="w-7 h-7 rounded-[10px] bg-[#c3ff01] border border-black/15 flex items-center justify-center shadow-md shadow-black/20">
                            <Image
                              src="/images/limitless-logo-new.webp"
                              alt="Limitless"
                              width={22}
                              height={22}
                              className="h-5 w-5 object-contain"
                            />
                          </span>
                        ) : selectedPredictionSubmode === "myriad" ? (
                          <span className="w-7 h-7 rounded-[10px] bg-black border border-[#ffc000]/20 flex items-center justify-center shadow-md shadow-black/60">
                            <Image
                              src="/images/myriad.webp"
                              alt="Myriad"
                              width={24}
                              height={24}
                              className="h-5 w-auto object-contain rounded"
                            />
                          </span>
                        ) : selectedPredictionSubmode === "predictfun" ? (
                          <span className="w-7 h-7 rounded-[10px] flex items-center justify-center shadow-md shadow-black/60">
                            <Image
                              src="/images/predict-fun.webp"
                              alt="Predict.fun"
                              width={22}
                              height={22}
                              className="h-5 w-5 object-contain"
                            />
                          </span>
                        ) : (
                          <Image
                            src="/images/market-opened.png"
                            alt="Internet Markets"
                            width={22}
                            height={22}
                            className="h-5 w-auto object-contain"
                          />
                        )}
                      </span>
                    )}

                    {/* Crypto: category icon or chain icon */}
                    {marketMode === "Crypto" && (
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0 overflow-hidden"
                        aria-hidden
                      >
                        {cryptoDisplayLevel === "category" ? (
                          <Image
                            src="/images/crypto.webp"
                            alt="Crypto"
                            width={22}
                            height={22}
                            className="h-5 w-auto object-contain"
                          />
                        ) : (
                          <Image
                            src={collapsedCryptoIconSrc}
                            alt={CRYPTO_CHAIN_LABEL[selectedCryptoChain]}
                            width={20}
                            height={20}
                            className="h-5 w-auto object-contain"
                          />
                        )}
                      </span>
                    )}

                    {/* Prediction Markets: category icon or provider icon */}
                    {(marketMode === "Kalshi" || marketMode === "Polymarket") && (
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0 overflow-hidden"
                        aria-hidden
                      >
                        {predictionDisplayLevel === "category" ? (
                          <Image
                            src="/images/predection-markets.png"
                            alt="Prediction Markets"
                            width={20}
                            height={20}
                            className="h-5 w-auto object-contain"
                          />
                        ) : selectedPredictionSubmode === "kalshi" ? (
                          <span className="w-5 h-5 rounded flex items-center justify-center bg-[#17cb91] text-white text-xs font-bold">
                            K
                          </span>
                        ) : selectedPredictionSubmode === "polymarket" ? (
                          <Image
                            src="/images/polymarket.png"
                            alt="Polymarket"
                            width={20}
                            height={20}
                            className="h-5 w-auto object-contain"
                          />
                        ) : selectedPredictionSubmode === "myriad" ? (
                          <Image
                            src="/images/myriad.webp"
                            alt="Myriad"
                            width={20}
                            height={20}
                            className="h-5 w-auto object-contain rounded"
                          />
                        ) : selectedPredictionSubmode === "limitless" ? (
                          <span className="w-5 h-5 rounded flex items-center justify-center bg-[#c3ff01] overflow-hidden border border-black/10">
                            <Image
                              src="/images/limitless-logo-new.webp"
                              alt="Limitless"
                              width={18}
                              height={18}
                              className="object-contain"
                            />
                          </span>
                        ) : null}
                      </span>
                    )}
                    <span className="text-[#FFC000] font-semibold">
                      {collapsedLabel}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-white/50 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {dropdownOpen &&
                    !isInputDisabled &&
                    createPortal(
                      <div
                        ref={dropdownRef}
                        className="fixed min-w-[230px] py-2 bg-gradient-to-b from-[#171717] to-[#050505] border border-white/10 rounded-2xl shadow-2xl shadow-black/70 backdrop-blur-md z-[9999] origin-top transform-gpu animate-[dropdown-in_140ms_ease-out]"
                        role="listbox"
                        style={{
                          top: dropdownPosition.top,
                          left: dropdownPosition.left,
                          transform: "translateY(-100%)",
                        }}
                      >
                        {/* Internet Markets */}
                        <button
                          type="button"
                          role="option"
                          aria-selected={
                            marketMode === "Markets" &&
                            !isMarketsModeProvider(selectedPredictionSubmode)
                          }
                          onClick={() => {
                            setMarketMode("Markets");
                            setSelectedPredictionSubmode("polymarket");
                            setDropdownOpen(false);
                          }}
                          className={`w-full px-3.5 py-2.5 text-left text-[13px] transition-colors flex items-center justify-between gap-2.5 ${
                            marketMode === "Markets" &&
                            !isMarketsModeProvider(selectedPredictionSubmode)
                              ? "bg-white/10 text-white"
                              : "text-white/80 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span className="flex items-center gap-2 shrink-0 min-w-[1.25rem]">
                            <span
                              className="w-5 h-5 flex items-center justify-center shrink-0"
                              aria-hidden
                            >
                              <Image
                                src="/images/market-opened.png"
                                alt="Internet Markets"
                                width={20}
                                height={20}
                                className="h-5 w-auto object-contain"
                              />
                            </span>
                            <span className="text-[#FFC000] font-semibold">
                              Internet Markets
                            </span>
                          </span>
                          {marketMode === "Markets" &&
                            !isMarketsModeProvider(selectedPredictionSubmode) && (
                            <span
                              className="text-[#FFC000] shrink-0"
                              aria-hidden
                            >
                              ✓
                            </span>
                          )}
                        </button>

                        <div className="my-1 h-px w-full bg-white/10" />

                        {/* Crypto group */}
                        <div className="px-3.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setMarketMode("Crypto");
                              setCryptoDisplayLevel("category");
                              setDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2.5 mb-1 rounded-xl px-2.5 py-1.5 -mx-1.5 -mt-0.5 transition-colors ${
                              marketMode === "Crypto" && cryptoDisplayLevel === "category"
                                ? "bg-white/10 text-white"
                                : "text-white/90 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span
                              className="w-5 h-5 rounded flex items-center justify-center p-0.5 shrink-0 overflow-hidden"
                              aria-hidden
                            >
                              <Image
                                src="/images/crypto.webp"
                                alt="Crypto"
                                width={20}
                                height={20}
                                className="h-5 w-auto object-contain"
                              />
                            </span>
                            <span className="text-[#FFC000] font-semibold text-[13px]">
                              Crypto
                            </span>
                            {marketMode === "Crypto" && cryptoDisplayLevel === "category" && (
                              <span
                                className="ml-auto text-[#FFC000] shrink-0"
                                aria-hidden
                              >
                                ✓
                              </span>
                            )}
                          </button>
                          <div className="flex flex-col gap-1.5 pl-8">
                            {[
                              {
                                key: "solana",
                                label: "Solana",
                                src: "/images/solana.png",
                              },
                              {
                                key: "ethereum",
                                label: "Ethereum",
                                src: "/images/ETH_light_logo.webp",
                              },
                              { key: "monad", label: "Monad", src: "/images/monad.png" },
                              { key: "base", label: "Base", src: "/images/base.png" },
                              {
                                key: "bnb",
                                label: "BNB",
                                src: "/images/bnbchain.png",
                              },
                            ].map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  setMarketMode("Crypto");
                                  setSelectedCryptoChain(
                                    item.key as
                                      | "solana"
                                      | "ethereum"
                                      | "base"
                                      | "bnb"
                                      | "monad",
                                  );
                                  setCryptoDisplayLevel("chain");
                                  setDropdownOpen(false);
                                }}
                                className={`flex items-center gap-2.5 text-[13px] rounded-lg px-2.5 py-1.5 transition-colors ${
                                  marketMode === "Crypto" &&
                                  selectedCryptoChain === item.key &&
                                  cryptoDisplayLevel === "chain"
                                    ? "bg-white/10 text-white"
                                    : "text-white hover:text-white/90 hover:bg-white/5"
                                }`}
                              >
                                <span
                                  className="w-5 h-5 flex items-center justify-center shrink-0 overflow-hidden"
                                  aria-hidden
                                >
                                  <Image
                                    src={item.src}
                                    alt={item.label}
                                    width={20}
                                    height={20}
                                    className="h-5 w-auto object-contain"
                                  />
                                </span>
                                <span>{item.label}</span>
                                {marketMode === "Crypto" &&
                                  selectedCryptoChain === item.key &&
                                  cryptoDisplayLevel === "chain" && (
                                    <span
                                      className="ml-auto text-[#FFC000] shrink-0"
                                      aria-hidden
                                    >
                                      ✓
                                    </span>
                                  )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="my-1 h-px w-full bg-white/10" />

                        {/* Prediction Markets group */}
                        <div className="px-3.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setMarketMode("Polymarket");
                              setSelectedPredictionSubmode("polymarket");
                              setPredictionDisplayLevel("category");
                              setDropdownOpen(false);
                            }}
                            className={`w-full flex items-center gap-2.5 mb-1 rounded-xl px-2.5 py-1.5 -mx-1.5 -mt-0.5 transition-colors ${
                              (marketMode === "Polymarket" ||
                                marketMode === "Kalshi" ||
                                (marketMode === "Markets" &&
                                  isMarketsModeProvider(selectedPredictionSubmode))) &&
                              predictionDisplayLevel === "category"
                                ? "bg-white/10 text-white"
                                : "text-white/90 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span
                              className="w-5 h-5 flex items-center justify-center shrink-0 overflow-hidden"
                              aria-hidden
                            >
                              <Image
                                src="/images/predection-markets.png"
                                alt="Prediction Markets"
                                width={20}
                                height={20}
                                className="h-5 w-auto object-contain"
                              />
                            </span>
                            <span className="text-[#FFC000] font-semibold text-[13px]">
                              Prediction Markets
                            </span>
                            {(marketMode === "Polymarket" ||
                              marketMode === "Kalshi" ||
                              (marketMode === "Markets" &&
                                isMarketsModeProvider(selectedPredictionSubmode))) &&
                              predictionDisplayLevel === "category" && (
                                <span
                                  className="ml-auto text-[#FFC000] shrink-0"
                                  aria-hidden
                                >
                                  ✓
                                </span>
                              )}
                          </button>
                          <div className="flex flex-col gap-1.5 pl-8">
                            {[
                              {
                                key: "predictfun",
                                label: "Predict.fun",
                                mode: "Markets" as const,
                                iconSrc: "/images/predict-fun.webp",
                              },
                              {
                                key: "myriad",
                                label: "Myriad",
                                mode: "Markets" as const,
                                iconSrc: "/images/myriad.webp",
                              },
                              {
                                key: "limitless",
                                label: "Limitless",
                                mode: "Markets" as const,
                                iconSrc: "/images/limitless-logo-new.webp",
                              },
                              {
                                key: "polymarket",
                                label: "Polymarket",
                                mode: "Polymarket" as const,
                                iconSrc: "/images/polymarket.png",
                              },
                              {
                                key: "kalshi",
                                label: "Kalshi",
                                mode: "Kalshi" as const,
                              },
                            ].map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  setMarketMode(item.mode);
                                  setSelectedPredictionSubmode(
                                    item.key as PredictionSubmode,
                                  );
                                  setPredictionDisplayLevel("provider");
                                  setDropdownOpen(false);
                                }}
                                className={`flex items-center gap-2.5 text-[13px] rounded-lg px-2.5 py-1.5 transition-colors ${
                                  selectedPredictionSubmode === item.key &&
                                  predictionDisplayLevel === "provider" &&
                                  ((item.key === "polymarket" && marketMode === "Polymarket") ||
                                    (item.key === "kalshi" && marketMode === "Kalshi") ||
                                    (item.key === "limitless" && marketMode === "Markets") ||
                                    (item.key === "myriad" && marketMode === "Markets") ||
                                    (item.key === "predictfun" && marketMode === "Markets"))
                                    ? "bg-white/10 text-white"
                                    : "text-white hover:text-white/90 hover:bg-white/5"
                                }`}
                              >
                                <span
                                  className="w-5 h-5 flex items-center justify-center shrink-0 overflow-hidden"
                                  aria-hidden
                                >
                                  {item.key === "kalshi" ? (
                                    <span className="w-5 h-5 rounded flex items-center justify-center bg-[#17cb91] text-white text-xs font-bold">
                                      K
                                    </span>
                                  ) : item.key === "polymarket" ? (
                                    <span className="w-8 h-8 rounded-[12px] bg-[#2C59F7] border border-[#1F46FF]/60 flex items-center justify-center backdrop-blur-sm">
                                      <Image
                                        src={item.iconSrc!}
                                        alt={item.label}
                                        width={20}
                                        height={20}
                                        className="h-4 w-4 object-contain"
                                      />
                                    </span>
                                  ) : item.key === "limitless" ? (
                                    <span className="w-8 h-8 rounded-[12px] bg-[#c3ff01] border border-black/15 flex items-center justify-center">
                                      <Image
                                        src={item.iconSrc!}
                                        alt={item.label}
                                        width={20}
                                        height={20}
                                        className="h-4 w-4 object-contain"
                                      />
                                    </span>
                                  ) : item.key === "predictfun" ? (
                                    <span className="w-8 h-8 flex items-center justify-center">
                                      <Image
                                        src={item.iconSrc!}
                                        alt={item.label}
                                        width={20}
                                        height={20}
                                        className="h-4 w-4 object-contain"
                                      />
                                    </span>
                                  ) : (
                                    <Image
                                      src={item.iconSrc!}
                                      alt={item.label}
                                      width={20}
                                      height={20}
                                      className="h-5 w-auto object-contain rounded-md"
                                    />
                                  )}
                                </span>
                                <span>{item.label}</span>
                                {selectedPredictionSubmode === item.key &&
                                  predictionDisplayLevel === "provider" &&
                                  ((item.key === "polymarket" &&
                                    marketMode === "Polymarket") ||
                                    (item.key === "kalshi" && marketMode === "Kalshi") ||
                                    (item.key === "limitless" &&
                                      marketMode === "Markets") ||
                                    (item.key === "myriad" && marketMode === "Markets") ||
                                    (item.key === "predictfun" &&
                                      marketMode === "Markets")) && (
                                    <span
                                      className="ml-auto text-[#FFC000] shrink-0"
                                      aria-hidden
                                    >
                                      ✓
                                    </span>
                                  )}
                              </button>
                            ))}
                          </div>
                        </div>
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
                disabled={!message.trim() || isInputDisabled}
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
