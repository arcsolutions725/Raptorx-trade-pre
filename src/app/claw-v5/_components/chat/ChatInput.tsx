"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import clsx from "clsx";
import SourceLogo, { type SourceLogoKind } from "./SourceLogo";

export type PredictionMarketMode =
  | "Markets"
  | "Crypto"
  | "Kalshi"
  | "Polymarket";

const DEFAULT_PLACEHOLDER =
  "Search Prediction Events, Arbitrage, Wallets, Cryptocurrencies and more!";

// Mode → default placeholder (selection-specific placeholders below win).
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

type CryptoChain = "solana" | "ethereum" | "base" | "bnb" | "monad";

const CRYPTO_CHAIN_LABEL: Record<CryptoChain, string> = {
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
  cryptoChain?: CryptoChain;
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
  /** Welcome screen: the composer rises in after the headline (prototype entrance). */
  intro?: boolean;
}

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
  intro = false,
}: ChatInputProps) {
  const [internalMode, setInternalMode] =
    useState<PredictionMarketMode>("Markets");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    bottom: 0,
    left: 0,
    maxHeight: 440,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const marketMode = controlledMode ?? internalMode;
  const setMarketMode = onMarketModeChange ?? setInternalMode;

  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastPrefillRef = useRef<string | undefined>(undefined);

  // Position the dropdown above the trigger when opening (it is portalled to <body>)
  useEffect(() => {
    if (!dropdownOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 268;
    setDropdownPosition({
      bottom: window.innerHeight - rect.top + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      maxHeight: Math.max(220, Math.min(440, rect.top - 16)),
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [dropdownOpen]);

  const isInputDisabled = isLoading || disabledProp;
  const [selectedCryptoChain, setSelectedCryptoChain] =
    useState<CryptoChain>("solana");
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

  /** Icon shown on the collapsed trigger for the current selection. */
  const collapsedIcon: SourceLogoKind =
    marketMode === "Crypto"
      ? cryptoDisplayLevel === "category"
        ? "crypto"
        : selectedCryptoChain
      : marketMode === "Markets"
        ? isMarketsModeProvider(selectedPredictionSubmode)
          ? selectedPredictionSubmode
          : "internet"
        : predictionDisplayLevel === "category"
          ? "prediction"
          : selectedPredictionSubmode;

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
    const next = Math.min(el.scrollHeight, 200);
    el.style.height = `${Math.max(next, 32)}px`;
  }, [message, placeholder]);

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

  const internetSelected =
    marketMode === "Markets" && !isMarketsModeProvider(selectedPredictionSubmode);
  const cryptoCategorySelected =
    marketMode === "Crypto" && cryptoDisplayLevel === "category";
  const predictionCategorySelected =
    (marketMode === "Polymarket" ||
      marketMode === "Kalshi" ||
      (marketMode === "Markets" &&
        isMarketsModeProvider(selectedPredictionSubmode))) &&
    predictionDisplayLevel === "category";

  const isProviderSelected = (key: PredictionSubmode) =>
    selectedPredictionSubmode === key &&
    predictionDisplayLevel === "provider" &&
    ((key === "polymarket" && marketMode === "Polymarket") ||
      (key === "kalshi" && marketMode === "Kalshi") ||
      (key === "limitless" && marketMode === "Markets") ||
      (key === "myriad" && marketMode === "Markets") ||
      (key === "predictfun" && marketMode === "Markets"));

  const checkMark = (
    <Check className="menu__check" strokeWidth={2.5} aria-hidden="true" />
  );

  const hasText = message.trim().length > 0;

  return (
    <div className="claw-composer">
      <div className="claw-col">
        {/* Quoted Content Display */}
        {quotedContent && (
          <div className="rx-well claw-quote">
            <div className="min-w-0 flex-1">
              <span className="rx-eyebrow">Quoting</span>
              <p className="claw-quote__text">{quotedContent}</p>
            </div>
            {onClearQuote && (
              <button
                type="button"
                onClick={onClearQuote}
                className="rx-icon-btn rx-icon-btn--s touch-manipulation"
                aria-label="Remove quote"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className={clsx("composer-wrap", intro && "composer-wrap--intro")}>
          <span className="composer__glow" aria-hidden="true" />
          <form
            onSubmit={handleSubmit}
            className={clsx(
              "rx-raised composer",
              hasText && "has-text",
              isLoading && "is-thinking",
              disabledProp && "is-disabled",
            )}
          >
            <span className="composer__ring" aria-hidden="true" />
            <label htmlFor="claw-composer-input" className="sr-only">
              Message Claw
            </label>
            <textarea
              id="claw-composer-input"
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
              className="custom-chat-input-scrollbar overflow-y-auto"
            />

            <div className="composer__bar">
              <div className="relative min-w-0">
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => {
                    if (isInputDisabled) return;
                    setDropdownOpen((open) => !open);
                  }}
                  disabled={isInputDisabled}
                  className="rx-btn rx-btn--secondary rx-btn--s composer__src"
                  aria-label={`Where Claw looks: ${collapsedLabel}`}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="listbox"
                >
                  <SourceLogo kind={collapsedIcon} onButton />
                  <span>{collapsedLabel}</span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                </button>
                {dropdownOpen &&
                  !isInputDisabled &&
                  createPortal(
                    <div className="rx-claw">
                      <div
                        ref={dropdownRef}
                        className="claw-menu"
                        role="listbox"
                        aria-label="Where Claw looks"
                        style={{
                          bottom: dropdownPosition.bottom,
                          left: dropdownPosition.left,
                          maxHeight: dropdownPosition.maxHeight,
                        }}
                      >
                        {/* Internet Markets */}
                        <button
                          type="button"
                          role="option"
                          aria-selected={internetSelected}
                          onClick={() => {
                            setMarketMode("Markets");
                            setSelectedPredictionSubmode("polymarket");
                            setDropdownOpen(false);
                          }}
                          className="menu__item menu__item--group"
                        >
                          <SourceLogo kind="internet" />
                          Internet Markets
                          {internetSelected && checkMark}
                        </button>

                        <hr />

                        {/* Crypto group */}
                        <span className="rx-eyebrow menu__group block px-2.5 pt-1.5 pb-1">
                          Crypto
                        </span>
                        <button
                          type="button"
                          role="option"
                          aria-selected={cryptoCategorySelected}
                          onClick={() => {
                            setMarketMode("Crypto");
                            setCryptoDisplayLevel("category");
                            setDropdownOpen(false);
                          }}
                          className="menu__item menu__item--group"
                        >
                          <SourceLogo kind="crypto" />
                          All crypto
                          {cryptoCategorySelected && checkMark}
                        </button>
                        {(
                          [
                            "solana",
                            "ethereum",
                            "monad",
                            "base",
                            "bnb",
                          ] as CryptoChain[]
                        ).map((key) => {
                          const selected =
                            marketMode === "Crypto" &&
                            selectedCryptoChain === key &&
                            cryptoDisplayLevel === "chain";
                          return (
                            <button
                              key={key}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                setMarketMode("Crypto");
                                setSelectedCryptoChain(key);
                                setCryptoDisplayLevel("chain");
                                setDropdownOpen(false);
                              }}
                              className="menu__item"
                            >
                              <SourceLogo kind={key} />
                              {CRYPTO_CHAIN_LABEL[key]}
                              {selected && checkMark}
                            </button>
                          );
                        })}

                        <hr />

                        {/* Prediction Markets group */}
                        <span className="rx-eyebrow menu__group block px-2.5 pt-1.5 pb-1">
                          Prediction markets
                        </span>
                        <button
                          type="button"
                          role="option"
                          aria-selected={predictionCategorySelected}
                          onClick={() => {
                            setMarketMode("Polymarket");
                            setSelectedPredictionSubmode("polymarket");
                            setPredictionDisplayLevel("category");
                            setDropdownOpen(false);
                          }}
                          className="menu__item menu__item--group"
                        >
                          <SourceLogo kind="prediction" />
                          All prediction markets
                          {predictionCategorySelected && checkMark}
                        </button>
                        {(
                          [
                            { key: "predictfun", mode: "Markets" },
                            { key: "myriad", mode: "Markets" },
                            { key: "limitless", mode: "Markets" },
                            { key: "polymarket", mode: "Polymarket" },
                            { key: "kalshi", mode: "Kalshi" },
                          ] as {
                            key: PredictionSubmode;
                            mode: PredictionMarketMode;
                          }[]
                        ).map((item) => {
                          const selected = isProviderSelected(item.key);
                          return (
                            <button
                              key={item.key}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => {
                                setMarketMode(item.mode);
                                setSelectedPredictionSubmode(item.key);
                                setPredictionDisplayLevel("provider");
                                setDropdownOpen(false);
                              }}
                              className="menu__item"
                            >
                              <SourceLogo kind={item.key} />
                              {PREDICTION_SUBMODE_LABEL[item.key]}
                              {selected && checkMark}
                            </button>
                          );
                        })}
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>

              {isLoading && onStop ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="rx-btn rx-btn--s composer__stop"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <span className="stop-sq" aria-hidden="true" />
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!message.trim() || isInputDisabled}
                  className="rx-btn rx-btn--claw rx-btn--s composer__send"
                  aria-label="Ask Claw"
                  title="Send (Enter)"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="claw-ico claw-logo"
                    src="/images/claw-logo-96.webp"
                    width={18}
                    height={18}
                    alt=""
                  />
                  Ask Claw
                </button>
              )}
            </div>
          </form>
        </div>
        <p className="composer__hint">
          Claw can be wrong. Check key figures before you trade.
        </p>
      </div>
    </div>
  );
}
