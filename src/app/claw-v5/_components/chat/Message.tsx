"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import copy from "copy-to-clipboard";
import { Copy, User, Quote, Check, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { RexMarketsEmbed } from "./RexMarketsEmbed";
import { CryptoTechnicalEmbed } from "./CryptoTechnicalEmbed";
import { TopMarketsCards } from "./TopMarketsCards";
export interface MessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  /**
   * Stable React list key for optimistic→server id handoff. When set, use as `key` so swapping
   * `temp-*` ids for database ids does not remount the bubble (avoids a visible “restream”).
   */
  uiKey?: string;
}

interface MessageProps {
  message: MessageData;
  onEdit?: (messageId: string, newContent: string) => void;
  onCopy?: (content: string) => void;
  onQuote?: (content: string) => void;
  onCryptoReport?: (payload: any) => void;
  onDeepAnalysisMarket?: (params: {
    provider: "polymarket" | "kalshi" | "limitless" | "myriad" | "predictfun";
    marketId: string;
    title: string;
  }) => void | Promise<void>;
  isStreaming?: boolean;
  streamingPhase?: "" | "markets" | "report" | "research" | "draft" | "synth";
  streamingStatusLabel?: string;
  /** Streams web-research + draft tokens before the final synthesized answer. */
  streamingThinking?: string;
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // GFM tables
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    // Common helpful tags
    "details",
    "summary",
    "kbd",
  ],
  attributes: {
    ...(defaultSchema.attributes || {}),
    a: [
      ...((defaultSchema.attributes as any)?.a || []),
      "target",
      "rel",
      "title",
    ],
    img: [
      ...((defaultSchema.attributes as any)?.img || []),
      "src",
      "alt",
      "title",
      "width",
      "height",
      "loading",
    ],
    th: [
      ...((defaultSchema.attributes as any)?.th || []),
      "align",
      "colspan",
      "rowspan",
    ],
    td: [
      ...((defaultSchema.attributes as any)?.td || []),
      "align",
      "colspan",
      "rowspan",
    ],
    code: [
      ...((defaultSchema.attributes as any)?.code || []),
      "className",
    ],
  },
  protocols: {
    ...(defaultSchema.protocols || {}),
    href: ["http", "https", "mailto", "tel"],
    src: ["http", "https", "data"],
  },
};

const baseMarkdownComponents = {
  h1: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-white font-semibold text-lg mt-3 mb-2" {...props} />
  ),
  h2: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-white font-semibold text-base mt-3 mb-2" {...props} />
  ),
  h3: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-white font-semibold text-sm mt-3 mb-2" {...props} />
  ),
  p: ({ ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-white/80 leading-relaxed my-2 break-words" {...props} />
  ),
  strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="text-[#f0cf7a] font-semibold" {...props} />
  ),
  em: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="text-white/80 italic" {...props} />
  ),
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-[#ffc000] underline underline-offset-2 hover:text-[#ffda44] break-all whitespace-normal"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  img: ({ ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // Intentionally not using next/image here; sources can be arbitrary URLs in AI output.
    // Sanitization limits attributes + protocols.
    <img className="max-w-full h-auto rounded-lg my-3" loading="lazy" {...props} />
  ),
  ul: ({ ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside my-2 space-y-1 break-words" {...props} />
  ),
  ol: ({ ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside my-2 space-y-1 break-words" {...props} />
  ),
  li: ({ ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-white/80 break-words" {...props} />
  ),
  blockquote: ({ ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-2 border-[#ffc000]/60 pl-3 my-3 text-white/70"
      {...props}
    />
  ),
  hr: ({ ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="border-white/10 my-4" {...props} />
  ),
  code: ({
    inline,
    className,
    children,
    ...props
  }: any) => {
    if (inline) {
      return (
        <code
          className={`bg-white/10 px-1 py-0.5 rounded text-[13px] break-words ${className || ""}`}
          {...props}
        >
          {children}
        </code>
      );
    }

    // For fenced code blocks, let <pre> handle the padding/background.
    return (
      <code className={`text-[13px] ${className || ""}`} {...props}>
        {children}
      </code>
    );
  },
  table: ({ ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-hidden">
      <table className="w-full border-collapse table-fixed" {...props} />
    </div>
  ),
  th: ({ ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-white/10 px-2 py-1 text-left text-white/80 break-words align-top"
      {...props}
    />
  ),
  td: ({ ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td
      className="border border-white/10 px-2 py-1 text-white/70 align-top break-words"
      {...props}
    />
  ),
};

function CryptoTechEmbedAutoOpen({
  payload,
  onReport,
}: {
  payload: any;
  onReport?: (payload: any) => void;
}) {
  const seenRef = useRef<Set<string>>(new Set());

  const key = useMemo(() => {
    const tokenAddr = payload?.token?.tokenAddress || payload?.analysis?.tokenAddress || "";
    const indicator = payload?.analysis?.indicatorType || payload?.analysis?.indicator || payload?.indicatorType || "";
    const timeframe = payload?.analysis?.timeframe || "15m";
    return `${tokenAddr}|${String(indicator)}|${String(timeframe)}`;
  }, [payload]);

  useEffect(() => {
    if (!onReport) return;
    if (!key || key.startsWith("|")) return;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);
    onReport(payload);
  }, [key, onReport, payload]);

  return <CryptoTechnicalEmbed payload={payload} />;
}

type Citation = { title: string; url: string; domain: string };

function normalizeSourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid",
    ]);
    for (const k of Array.from(url.searchParams.keys())) {
      if (drop.has(k)) url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function parseSourcesSection(content: string): { main: string; citations: Citation[] } {
  const re = /(^|\n)\s*(#{1,6}\s*)?Sources\s*:?\s*(?=\n)/gi;
  const matches = Array.from(content.matchAll(re));
  if (matches.length === 0) return { main: content, citations: [] };

  const last = matches[matches.length - 1];
  const idx = last.index ?? -1;
  if (idx < 0) return { main: content, citations: [] };

  const main = content.slice(0, idx).trimEnd();
  const sources = content.slice(idx).split("\n");

  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (const line of sources) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-") && !trimmed.startsWith("*")) continue;

    // - [Title](https://example.com)
    const md = trimmed.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
    if (md) {
      const title = md[1].trim();
      const url = normalizeSourceUrl(md[2].trim());
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        const key = url.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          citations.push({ title, url, domain });
        }
      } catch {
        // ignore
      }
      continue;
    }

    // - https://example.com
    const bare = trimmed.match(/(https?:\/\/\S+)/i);
    if (bare) {
      const url = normalizeSourceUrl(bare[1].replace(/[),.;!?]+$/g, ""));
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        const title = domain;
        const key = url.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          citations.push({ title, url, domain });
        }
      } catch {
        // ignore
      }
    }
  }

  return { main, citations };
}

const STREAMING_COUNTDOWN_START = 20;

export function StreamingStatus({
  label,
  phase,
  countdownSeconds,
  minimal = false,
}: {
  label: string;
  phase: "" | "markets" | "report" | "research" | "draft" | "synth";
  countdownSeconds?: number;
  minimal?: boolean;
}) {
  if (!label && !phase) return null;

  const fallback =
    phase === "markets"
      ? "Searching in RaptorX…"
      : phase === "report"
        ? "Generating technical report…"
        : phase === "research"
        ? "Web searching official sources…"
        : phase === "draft"
          ? "Drafting response…"
          : phase === "synth"
            ? "Finalizing answer…"
            : "";

  const text = label || fallback;

  if (minimal) {
    return (
      <div className="inline-flex items-center gap-2 text-[12px] text-[#FFC000]">
        <span>{text}</span>
        {typeof countdownSeconds === "number" && (
          <span className="tabular-nums text-[#FFC000]/90 font-medium" aria-label={`${countdownSeconds} seconds remaining`}>
            {countdownSeconds}s
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#FFC000]/40 bg-[#141414] px-3 py-1.5 text-[12px] text-[#FFC000]">
      {phase === "markets" ? (
        <Image
          src="/images/raptorx.png"
          alt="RaptorX"
          width={16}
          height={16}
          className="w-4 h-4"
        />
      ) : (
        <Loader2 className="w-4 h-4 animate-spin" />
      )}
      <span>{text}</span>
      {typeof countdownSeconds === "number" && (
        <span className="tabular-nums text-[#FFC000]/90 font-medium" aria-label={`${countdownSeconds} seconds remaining`}>
          {countdownSeconds}s
        </span>
      )}
    </div>
  );
}

// Shown only when streaming but no phase yet (API hasn't sent first status). Once API sends phase, we show only that phase's label via StreamingStatus.
export function ConnectingStatus({ countdownSeconds, minimal = false }: { countdownSeconds?: number; minimal?: boolean }) {
  if (minimal) {
    return (
      <div className="inline-flex items-center gap-2 text-[12px] text-[#FFC000]">
        <span>Connecting…</span>
        {typeof countdownSeconds === "number" && (
          <span className="tabular-nums text-[#FFC000]/90 font-medium" aria-label={`${countdownSeconds} seconds remaining`}>
            {countdownSeconds}s
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#FFC000]/40 bg-[#141414] px-3 py-1.5 text-[12px] text-[#FFC000]">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>Connecting…</span>
      {typeof countdownSeconds === "number" && (
        <span className="tabular-nums text-[#FFC000]/90 font-medium" aria-label={`${countdownSeconds} seconds remaining`}>
          {countdownSeconds}s
        </span>
      )}
    </div>
  );
}

function CitationCards({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="text-white/80 text-sm mb-2 font-medium">Sources</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {citations.map((c) => (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex gap-3 rounded-xl border border-white/10 bg-[#141414] hover:border-[#FFC000]/60 transition-colors p-3"
            title={c.url}
          >
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden">
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                  c.domain
                )}&sz=64`}
                alt=""
                className="w-6 h-6"
                loading="lazy"
              />
            </div>
            <div className="min-w-0">
              <div
                className="text-white/90 text-sm font-medium"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {c.title || c.domain}
              </div>
              <div className="text-white/50 text-xs mt-1 truncate">
                {c.domain}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function Message({
  message,
  onEdit,
  onCopy,
  onQuote,
  onCryptoReport,
  onDeepAnalysisMarket,
  isStreaming = false,
  streamingPhase = "",
  streamingStatusLabel = "",
  streamingThinking = "",
}: MessageProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [streamingCountdown, setStreamingCountdown] = useState(STREAMING_COUNTDOWN_START);
  const wasStreamingRef = useRef(false);
  const isUser = message.role === "user";

  // Countdown 20→0, then reset to 20, while streaming (same as Prediction Market; works for both phase and no-phase e.g. crypto).
  useEffect(() => {
    if (!isStreaming) {
      wasStreamingRef.current = false;
      return;
    }
    if (!wasStreamingRef.current) {
      setStreamingCountdown(STREAMING_COUNTDOWN_START);
      wasStreamingRef.current = true;
    }
    const interval = setInterval(() => {
      setStreamingCountdown((prev) => (prev <= 0 ? STREAMING_COUNTDOWN_START : prev - 1));
    }, 1000);
    return () => {
      clearInterval(interval);
      if (!isStreaming) wasStreamingRef.current = false;
    };
  }, [isStreaming]);
  const { main: mainContent, citations } = !isUser
    ? parseSourcesSection(message.content || "")
    : { main: message.content || "", citations: [] as Citation[] };
  /** Hide phase pills (Connecting / Drafting / etc.) once any streamed text is visible. */
  const hasVisibleStreamingOutput =
    !isUser &&
    isStreaming &&
    (Boolean((message.content || "").trim()) ||
      Boolean((streamingThinking || "").trim()));
  const contentWidthClass = isUser
    ? "max-w-[85%] md:max-w-[80%]"
    : "w-full max-w-full";

  const markdownPre = useMemo(() => {
    return function MarkdownPre({
      children,
      ...props
    }: React.HTMLAttributes<HTMLPreElement>) {
      // Special-case RexMarkets embed blocks:
      // ```rexmarkets
      // {...json...}
      // ```
      // NOTE: In some builds the <pre> children can start with a newline text node
      // followed by the <code> element, so don't assume children[0] is <code>.
      const childArray = (Array.isArray(children)
        ? children
        : (children ? [children] : [])) as any[];
      const codeChild: any = childArray.find(
        (c) => c && typeof c === "object" && typeof c?.props?.className === "string"
      );

      const className: string | undefined = codeChild?.props?.className;
      const isRex =
        typeof className === "string" &&
        className.includes("language-rexmarkets");
      const isTopMarkets =
        typeof className === "string" &&
        className.includes("language-topmarkets");
      const isCryptoTech =
        typeof className === "string" &&
        className.includes("language-cryptotech");
      const raw = codeChild?.props?.children;
      const rawText =
        typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("") : null;

      if (isTopMarkets && typeof rawText === "string") {
        try {
          const payload = JSON.parse(rawText) as any;
          if (payload?.kind === "top_markets") {
            return (
              <TopMarketsCards
                payload={payload}
                onDeepAnalysis={onDeepAnalysisMarket}
              />
            );
          }
        } catch {
          // fall through to default pre rendering
        }
      }

      if (isRex && typeof rawText === "string") {
        try {
          const payload = JSON.parse(rawText) as any;
          if (payload?.kind === "rexmarkets" && payload?.marketDetails) {
            return <RexMarketsEmbed payload={payload} />;
          }
        } catch {
          // fall through to default pre rendering
        }
      }

      if (isCryptoTech && typeof rawText === "string") {
        try {
          const payload = JSON.parse(rawText) as any;
          if (payload?.kind === "indicator" && payload?.analysis) {
            return (
              <CryptoTechEmbedAutoOpen
                payload={payload}
                onReport={onCryptoReport}
              />
            );
          }

          if (
            payload?.kind === "technical_report" &&
            (payload?.report || payload?.report?.report)
          ) {
            return (
              <CryptoTechEmbedAutoOpen
                payload={payload}
                onReport={onCryptoReport}
              />
            );
          }
        } catch {
          // fall through to default pre rendering
        }
      }

      return (
        <pre
          className="bg-white/10 p-3 rounded-lg overflow-x-hidden whitespace-pre-wrap break-words my-3 text-[13px] leading-relaxed max-w-full"
          {...props}
        >
          {children}
        </pre>
      );
    };
  }, [onCryptoReport, onDeepAnalysisMarket]);

  const mdComponents = useMemo(
    () =>
      ({
        ...baseMarkdownComponents,
        h1: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
          <h1
            className="text-[#ffc000] font-semibold text-lg mt-3 mb-2 scroll-mt-6"
            {...props}
          />
        ),
        h2: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
          <h2
            className="text-[#ffc000] font-semibold text-base mt-3 mb-2 scroll-mt-6"
            {...props}
          />
        ),
        h3: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
          <h3
            className="text-[#ffc000] font-semibold text-sm mt-3 mb-2 scroll-mt-6"
            {...props}
          />
        ),
        strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
          <strong className="text-[#f0cf7a] font-semibold" {...props} />
        ),
        th: ({ ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
          <th
            className="border border-white/10 px-2 py-1 text-left text-[#f0cf7a] font-semibold break-words align-top"
            {...props}
          />
        ),
        pre: markdownPre,
      }) as any,
    [markdownPre],
  );

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  return (
    <div
      className={`flex gap-2 md:gap-4 py-4 md:py-6 bg-black group transition-colors ${
        isUser
          ? "flex-row-reverse px-2 md:px-4"
          : "flex-col md:flex-row items-stretch px-1.5 sm:px-2 md:px-4"
      }`}
    >
      {/* Avatar — assistant: stacked above content on mobile so report embeds use full width */}
      <div className={`flex-shrink-0 ${isUser ? "" : "md:self-start"}`}>
        {isUser ? (
          <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#141414] flex items-center justify-center">
            <User className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
          </div>
        ) : (
          <div className="w-7 h-7 md:w-8 md:h-8 relative flex items-center justify-center">
            <Image
              src="/images/claw-v5.webp"
              alt="Claw v5"
              fill
              className="object-contain rounded-full"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className={`flex flex-col ${isUser ? "items-end" : "items-stretch"} ${contentWidthClass} min-w-0 ${isUser ? "" : "w-full md:flex-1"}`}
      >
        {isUser ? (
          // User message with gray background box - aligned right
          <div className="bg-[#141414] rounded-lg p-2.5 md:p-3 mb-2 inline-block max-w-full break-words">
            <div className="text-white/80 whitespace-pre-wrap text-sm leading-relaxed break-words" style={{ fontSize: "14px" }}>
              {message.content}
            </div>
          </div>
        ) : (
          // AI message with plain text - aligned left
          <div
            className="text-white/80 text-sm leading-relaxed mb-2 break-words max-w-full min-w-0 w-full"
            style={{ fontSize: "14px" }}
          >
            {isStreaming && streamingPhase && !hasVisibleStreamingOutput && (
              <StreamingStatus
                label={streamingStatusLabel}
                phase={streamingPhase}
                countdownSeconds={streamingCountdown}
              />
            )}
            {isStreaming && !streamingPhase && !hasVisibleStreamingOutput && (
              <ConnectingStatus countdownSeconds={streamingCountdown} />
            )}
            <div className="rex-markets-report-md rex-markets-report-md--fluid max-w-full">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[
                rehypeRaw,
                // rehype-raw enables HTML; sanitize keeps it safe.
                // Cast keeps TS happy with the tuple signature.
                [rehypeSanitize as any, sanitizeSchema as any],
              ]}
              components={mdComponents}
            >
              {mainContent}
            </ReactMarkdown>
            </div>
            {isStreaming && streamingThinking.trim() ? (
              <div className="rex-markets-report-md rex-markets-report-md--fluid mt-4 max-w-full border-t border-white/10 pt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#ffc000]/85 mb-2">
                  Live notes
                </div>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  rehypePlugins={[
                    rehypeRaw,
                    [rehypeSanitize as any, sanitizeSchema as any],
                  ]}
                  components={mdComponents}
                >
                  {streamingThinking}
                </ReactMarkdown>
              </div>
            ) : null}
            {!isStreaming && <CitationCards citations={citations} />}
          </div>
        )}
        
        {/* Settings buttons: only show on completed messages (on hover); hidden during entire streaming (loader2 + StreamingStatus) */}
        {!isStreaming && (
          <div className={`flex items-center gap-0.5 md:gap-1 opacity-0 group-hover:opacity-100 md:group-hover:opacity-100 group-active:opacity-100 transition-opacity mt-1.5 md:mt-2 ${isUser ? 'flex-row-reverse' : ''}`}>
            {onQuote && (
              <button
                onClick={() => onQuote(message.content)}
                className="p-1.5 hover:bg-[#2a2a2a] rounded transition-colors"
                title="Quote"
              >
                <Quote className="w-4 h-4 text-gray-400" />
              </button>
            )}
            <button
              onClick={() => {
                copy(message.content);
                setIsCopied(true);
                if (onCopy) {
                  onCopy(message.content);
                }
              }}
              className="p-1.5 hover:bg-[#2a2a2a] rounded transition-colors"
              title={isCopied ? "Copied!" : "Copy"}
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-[#ffc000]" />
              ) : (
                <Copy className="w-4 h-4 text-gray-400" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

