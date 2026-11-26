"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import copy from "copy-to-clipboard";
import { Copy, Quote, Check, Share } from "lucide-react";
import clsx from "clsx";
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
  /** Share one answer (Claw messages only): the chat's share link, pointing at this answer. */
  onShare?: (message: MessageData) => void;
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

/**
 * Answer typography (claw.css `.claw-md-*`). Classes only go on elements the markdown renders,
 * so the market / technical-report embeds keep their own styling.
 */
const markdownComponents = {
  h1: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="claw-md-h1" {...props} />
  ),
  h2: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="claw-md-h2" {...props} />
  ),
  h3: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="claw-md-h3" {...props} />
  ),
  p: ({ ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="claw-md-p" {...props} />
  ),
  strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="claw-md-strong" {...props} />
  ),
  em: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="claw-md-em" {...props} />
  ),
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="claw-md-a"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  img: ({ ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // Intentionally not using next/image here; sources can be arbitrary URLs in AI output.
    // Sanitization limits attributes + protocols.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img className="claw-md-img" loading="lazy" {...props} />
  ),
  ul: ({ ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="claw-md-ul" {...props} />
  ),
  ol: ({ ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="claw-md-ol" {...props} />
  ),
  li: ({ ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="claw-md-li" {...props} />
  ),
  blockquote: ({ ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="claw-md-quote" {...props} />
  ),
  hr: ({ ...props }: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="claw-md-hr" {...props} />
  ),
  code: ({
    inline,
    className,
    children,
    ...props
  }: any) => {
    if (inline) {
      return (
        <code className={`claw-md-code ${className || ""}`} {...props}>
          {children}
        </code>
      );
    }

    // For fenced code blocks, let <pre> handle the padding/background.
    return (
      <code className={className || ""} {...props}>
        {children}
      </code>
    );
  },
  table: ({ ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="claw-md-table">
      <table {...props} />
    </div>
  ),
  th: ({ ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th className="claw-md-th" {...props} />
  ),
  td: ({ ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="claw-md-td" {...props} />
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

/** Decorative "reading the markets" grid shown while Claw thinks (CSS-only motion). */
const SCAN_CELLS = Array.from({ length: 96 }, (_, i) => {
  const level = ["l1", "l2", "l2", "l3", "l4"][(i * 7) % 5];
  return {
    on: (i * 31) % 5 < 3,
    className: level,
    style: {
      "--d": `${(((i * 53) % 97) / 97) * 3.2}s`,
      "--t": `${2.2 + ((i * 17) % 9) / 6}s`,
    } as React.CSSProperties,
  };
});

function ScanGrid() {
  return (
    <div className="scan" aria-hidden="true">
      {SCAN_CELLS.map((c, i) => (
        <i key={i} className={clsx(c.className, c.on && "on")} style={c.style} />
      ))}
    </div>
  );
}

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
      <div className="think__status think__status--chip" role="status">
        <span className="shine">{text}</span>
        {typeof countdownSeconds === "number" && (
          <span className="think__time" aria-label={`${countdownSeconds} seconds remaining`}>
            {countdownSeconds}s
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="think" role="status" aria-live="polite">
      <p className="think__status">
        <span key={text} className="shine think__word">
          {text}
        </span>
        {typeof countdownSeconds === "number" && (
          <span className="think__time" aria-label={`${countdownSeconds} seconds remaining`}>
            {countdownSeconds}s
          </span>
        )}
      </p>
      <ScanGrid />
    </div>
  );
}

// Shown only when streaming but no phase yet (API hasn't sent first status). Once API sends phase, we show only that phase's label via StreamingStatus.
export function ConnectingStatus({ countdownSeconds, minimal = false }: { countdownSeconds?: number; minimal?: boolean }) {
  if (minimal) {
    return (
      <div className="think__status think__status--chip" role="status">
        <span className="shine">Connecting…</span>
        {typeof countdownSeconds === "number" && (
          <span className="think__time" aria-label={`${countdownSeconds} seconds remaining`}>
            {countdownSeconds}s
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="think" role="status" aria-live="polite">
      <p className="think__status">
        <span className="shine think__word">Connecting…</span>
        {typeof countdownSeconds === "number" && (
          <span className="think__time" aria-label={`${countdownSeconds} seconds remaining`}>
            {countdownSeconds}s
          </span>
        )}
      </p>
      <ScanGrid />
    </div>
  );
}

function CitationCards({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <section className="claw-sources" aria-label="Sources">
      <span className="rx-eyebrow">Sources</span>
      <div className="claw-sources__grid">
        {citations.map((c) => (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="claw-source"
            title={c.url}
          >
            <span className="claw-source__ico">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(
                  c.domain
                )}&sz=64`}
                alt=""
                width={18}
                height={18}
                loading="lazy"
              />
            </span>
            <span className="claw-source__text">
              <span className="claw-source__t">{c.title || c.domain}</span>
              <span className="claw-source__d">{c.domain}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

const markdownRehypePlugins = [
  rehypeRaw,
  // rehype-raw enables HTML; sanitize keeps it safe.
  // Cast keeps TS happy with the tuple signature.
  [rehypeSanitize as any, sanitizeSchema as any],
] as any;

/* ---------- word-by-word reveal of a new answer (design/js/claw.js `wordify`) ----------
   While an answer streams, every word of the rendered markdown is wrapped in `<span class="claw-w">`
   (claw.css fades it in). Words already on screen keep their element, so only the words a chunk
   adds animate in, each a little after the one before. Nothing is held back: every word is in the
   DOM the moment it arrives. Code blocks (and the market / report embeds they carry) are left alone. */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const WORD_REVEAL_SKIP = new Set(["pre", "code", "kbd", "script", "style", "svg"]);
/** Stagger between the words one chunk adds, and the most a word waits (the stream itself isn't delayed). */
const WORD_REVEAL_STEP_MS = 22;
const WORD_REVEAL_MAX_STEPS = 12;

function rehypeWordReveal(options: {
  /** Words already shown by the previous render: they get no delay. */
  from: number;
  /** Receives this render's word count. */
  count: { current: number };
}) {
  return (tree: HastNode) => {
    let index = 0;
    const walk = (node: HastNode) => {
      if (!node.children) return;
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string" && child.value.trim()) {
          for (const part of child.value.split(/(\s+)/)) {
            if (!part) continue;
            if (!part.trim()) {
              next.push({ type: "text", value: part });
              continue;
            }
            const step = Math.min(Math.max(index - options.from, 0), WORD_REVEAL_MAX_STEPS);
            index += 1;
            next.push({
              type: "element",
              tagName: "span",
              properties: {
                className: ["claw-w"],
                ...(step > 0 ? { style: `--claw-w-d:${step * WORD_REVEAL_STEP_MS}ms` } : {}),
              },
              children: [{ type: "text", value: part }],
            });
          }
          continue;
        }
        if (child.type === "element" && !WORD_REVEAL_SKIP.has(child.tagName ?? "")) walk(child);
        next.push(child);
      }
      node.children = next;
    };
    walk(tree);
    options.count.current = index;
  };
}

/** prefers-reduced-motion, kept in sync with the OS setting. */
function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduce;
}

export default function Message({
  message,
  onEdit: _onEdit,
  onCopy,
  onQuote,
  onShare,
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

  // Word-by-word reveal: only answers that stream in while this bubble is on screen (not history).
  // Words stay wrapped after the stream ends so the last ones finish fading in without a jump.
  const reduceMotion = usePrefersReducedMotion();
  const [streamedHere, setStreamedHere] = useState(isStreaming);
  if (isStreaming && !streamedHere) setStreamedHere(true);
  const revealWords = streamedHere && !isUser && !reduceMotion;
  const revealCountRef = useRef(0);
  const revealShownRef = useRef(0);
  useEffect(() => {
    revealShownRef.current = revealCountRef.current;
  });
  const answerRehypePlugins = revealWords
    ? [
        ...markdownRehypePlugins,
        [rehypeWordReveal, { from: revealShownRef.current, count: revealCountRef }],
      ]
    : markdownRehypePlugins;

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
        <pre className="claw-md-pre" {...props}>
          {children}
        </pre>
      );
    };
  }, [onCryptoReport, onDeepAnalysisMarket]);

  const mdComponents = useMemo(
    () =>
      ({
        ...markdownComponents,
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

  // Quote + copy: only on completed messages; hidden during the whole stream.
  const actions = !isStreaming ? (
    <div className="msg-actions">
      {onQuote && (
        <button
          type="button"
          onClick={() => onQuote(message.content)}
          className="rx-icon-btn rx-icon-btn--s"
          title="Quote"
          aria-label="Quote this message"
        >
          <Quote aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          copy(message.content);
          setIsCopied(true);
          if (onCopy) {
            onCopy(message.content);
          }
        }}
        className={clsx("rx-icon-btn rx-icon-btn--s", isCopied && "is-done")}
        title={isCopied ? "Copied!" : "Copy"}
        aria-label={isCopied ? "Copied" : "Copy message"}
      >
        {isCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      {!isUser && onShare && (
        <button
          type="button"
          onClick={() => onShare(message)}
          className="rx-icon-btn rx-icon-btn--s"
          title="Share"
          aria-label="Share answer"
        >
          <Share aria-hidden="true" />
        </button>
      )}
    </div>
  ) : null;

  if (isUser) {
    return (
      <div className="msg-user-wrap">
        <div className="msg-user">{message.content}</div>
        {actions}
      </div>
    );
  }

  return (
    <div
      className="msg-claw"
      // Anchor for a shared answer link (/claw-v5/<chat>#answer-<id>); temporary stream ids have none
      id={message.id && !message.id.startsWith("temp-") ? `answer-${message.id}` : undefined}
    >
      <span
        className={clsx("claw-mark", isStreaming && "claw-mark--pulse")}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="claw-ico claw-logo"
          src="/images/claw-logo-96.webp"
          width={19}
          height={19}
          alt=""
        />
      </span>

      <div className="msg-claw__body">
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
        {mainContent.trim() ? (
          <div className="rex-markets-report-md rex-markets-report-md--fluid claw-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={answerRehypePlugins}
              components={mdComponents}
            >
              {mainContent}
            </ReactMarkdown>
          </div>
        ) : null}
        {isStreaming && streamingThinking.trim() ? (
          <div className="live-notes">
            <span className="rx-eyebrow mb-2 block text-rx-gold-hi">
              Live notes
            </span>
            <div className="rex-markets-report-md rex-markets-report-md--fluid claw-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={markdownRehypePlugins}
                components={mdComponents}
              >
                {streamingThinking}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
        {!isStreaming && <CitationCards citations={citations} />}
        {actions}
      </div>
    </div>
  );
}
