"use client";

import { useCallback, useEffect, useRef, useState, useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import Image from "next/image";
import clsx from "clsx";
import { Square } from "lucide-react";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useRexChat } from "@/hooks/useRexChat";
import { useReportWithConversation } from "@/hooks/useReports";
import { PaywallModal, type PaywallLimitCode } from "@/components/ui/modal/PaywallModal";
import { formatRexPilotChatLines } from "@/lib/formatRexPilotChatLines";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useMarketReportStream } from "@/lib/storage/marketReportStreamStore";
import { stripFeaturedImageAndTitleSections } from "@/lib/rexmarkets/reportMarkdownDisplay";
import { useRexMarketsGenerateReportOptional } from "@/app/rexmarkets/_components/RexMarketsGenerateReportContext";

type AIGeneratedMarketsReportProps = {
  generatedReport?: MarketReport | null;
  userId?: string | null;
  selectedReportId?: string | null;
  /** Same key as `reportGenStore` / listing cards (ticker, slug, or id). */
  reportGenLookupKey?: string | null;
  selectedMarketTitle?: string | null;
  selectedMarketImageUrl?: string | null;
};

function pickMarketImageFromData(
  marketData: unknown,
  fallback: string | null,
): string | null {
  if (!marketData || typeof marketData !== "object") return fallback;
  const m = marketData as Record<string, unknown>;
  const u =
    (m.symbol_image_url as string) ||
    (m.image as string) ||
    (m.icon as string) ||
    (m.logo as string);
  return typeof u === "string" && u ? u : fallback;
}

const MAX_H = 200;

// Memoized rehype plugins array
const rehypePlugins = [rehypeRaw];

// Memoized markdown components to prevent recreation on every render
const markdownComponents = {
  h1: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...props} />
  ),
  h2: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} />
  ),
  h3: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} />
  ),
  h4: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 {...props} />
  ),
  h5: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 {...props} />
  ),
  h6: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6 {...props} />
  ),
  p: ({ ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} />
  ),
  ul: ({ ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc mb-4" {...props} />
  ),
  ol: ({ ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal mb-4" {...props} />
  ),
  li: ({ ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li {...props} />
  ),
  strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong {...props} />
  ),
  em: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em {...props} />
  ),
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a target="_blank" rel="noopener noreferrer" {...props} />
  ),
  u: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <u {...props} />
  ),
  th: ({ ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border border-white/10 px-2 py-2 text-left font-semibold"
      {...props}
    />
  ),
  td: ({ ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-white/10 px-2 py-2" {...props} />
  ),
  table: ({ ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div className="my-4 overflow-x-auto max-w-full">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  img: ({
    src,
    alt,
    width,
    height,
  }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // Only handle string sources (Blob not supported in markdown)
    if (!src || typeof src !== "string") return null;

    // Check if it's an external URL
    const isExternal = src.startsWith("http://") || src.startsWith("https://");

    // Use provided dimensions or smaller defaults for Next.js Image
    const imgWidth = width ? Number(width) : 400;
    const imgHeight = height ? Number(height) : 300;

    return (
      <div className="my-4 rounded-lg overflow-hidden inline-block max-w-full">
        <Image
          src={src}
          alt={alt || ""}
          width={imgWidth}
          height={imgHeight}
          className="rounded-lg max-w-full h-auto"
          unoptimized={isExternal}
          style={{ maxWidth: "100%", height: "auto", maxHeight: "400px" }}
        />
      </div>
    );
  },
  code: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <code className="bg-white/10 px-1 py-0.5 rounded text-sm" {...props} />
  ),
  pre: ({ ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="bg-white/10 p-4 rounded-lg overflow-x-auto mb-4"
      {...props}
    />
  ),
};

// Memoized empty state component
type EmptyStateProps = {
  onGenerateClick?: () => void | Promise<void>;
  generateDisabled?: boolean;
};

const EmptyState = memo(
  ({
    onGenerateClick,
    generateDisabled = false,
  }: EmptyStateProps) => (
    <div className="relative w-full min-h-0">
      <div className="flex w-full flex-col items-center justify-start px-4 py-2 sm:px-8 sm:py-3">
        <header className="flex w-full max-w-[420px] flex-col items-center justify-center text-center">
          <div className="flex items-end">
            <Image
              src="/images/rexmarket.png"
              alt="Rex Market"
              width={140}
              height={140}
              priority
              className="max-h-[96px] w-auto sm:max-h-[120px] md:max-h-[140px]"
            />
          </div>
          <div className="mt-2 flex w-full flex-col items-center gap-2 sm:mt-3 sm:gap-3 md:mt-3 md:gap-4">
            <div className="flex flex-col gap-2">
              <h1 className="w-full !font-normal !text-[14px] text-white sm:!text-[18px]">
                Conversational Intelligence for Event-Traders.
              </h1>
              <h4 className="w-full !text-[12px] !font-normal text-[#F2F2F2] sm:!text-[14px]">
                Click <span className="text-[#00B050]">Generate</span> to get
                Intelligence Reports for any prediction event!
              </h4>
            </div>
            {onGenerateClick && (
              <button
                type="button"
                onClick={() => void onGenerateClick()}
                disabled={generateDisabled}
                className={clsx(
                  "relative flex w-full max-w-[148px] shrink-0 items-center justify-center border-0 bg-transparent p-0 transition sm:max-w-[160px]",
                  generateDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:opacity-80",
                )}
                aria-label="Generate News Intelligence Report"
                style={{ flexShrink: 0, pointerEvents: "auto" }}
              >
                <Image
                  src="/images/generate.webp"
                  alt="Generate"
                  width={160}
                  height={64}
                  className="pointer-events-none h-auto w-full max-h-8 object-contain transition hover:scale-[1.05] sm:max-h-9"
                />
              </button>
            )}
          </div>
        </header>
      </div>
    </div>
  )
);
EmptyState.displayName = "EmptyState";

// Memoized assistant avatar component
const AssistantAvatar = memo(() => (
  <Image
    src="/images/assistant_banner.png"
    alt="Assistant avatar"
    width={120}
    height={80}
  />
));
AssistantAvatar.displayName = "AssistantAvatar";

const ReportMarketHeader = memo(function ReportMarketHeader({
  title,
  imageUrl,
}: {
  title: string;
  imageUrl: string | null;
}) {
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => {
    setImgErr(false);
  }, [imageUrl]);
  return (
    <div className="mb-5 flex shrink-0 items-start gap-3 border-b border-white/[0.12] pb-4 pl-1.5 sm:pl-2">
      <div
        className={clsx(
          "relative h-14 w-14 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-xl",
          "bg-gradient-to-br from-white/12 to-white/[0.04]",
          "ring-2 ring-amber-400/30 ring-inset",
        )}
      >
        {imageUrl && !imgErr ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover object-center"
            sizes="(max-width: 640px) 56px, 64px"
            unoptimized={
              imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
            }
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-white/35">
            —
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 className="text-left text-base font-semibold leading-snug text-white/95 sm:text-lg [word-break:break-word]">
          {title}
        </h2>
      </div>
    </div>
  );
});
ReportMarketHeader.displayName = "ReportMarketHeader";

const ReportStreamSkeleton = memo(function ReportStreamSkeleton({
  compact,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className={clsx("space-y-4 pt-1", compact && "mt-5 opacity-50")}
      aria-hidden
    >
      <div className="space-y-2.5">
        <div className="h-3 w-[60%] max-w-[14rem] rounded-md bg-white/[0.08] animate-pulse" />
        <div className="h-2.5 w-full rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-[92%] rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-[78%] rounded-md bg-white/[0.05] animate-pulse" />
      </div>
      <div className="space-y-2.5 pt-1">
        <div className="h-3 w-[42%] max-w-[10rem] rounded-md bg-white/[0.08] animate-pulse" />
        <div className="h-2.5 w-full rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-[88%] rounded-md bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-[70%] rounded-md bg-white/[0.05] animate-pulse" />
      </div>
      {!compact ? (
        <div className="space-y-2.5 pt-1">
          <div className="h-3 w-[40%] max-w-[11rem] rounded-md bg-white/[0.08] animate-pulse" />
          <div className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="h-16 w-20 shrink-0 rounded-lg bg-white/[0.06] animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <div className="h-2.5 w-full rounded-md bg-white/[0.06] animate-pulse" />
              <div className="h-2.5 w-[80%] rounded-md bg-white/[0.05] animate-pulse" />
            </div>
          </div>
          <div className="h-2.5 w-full rounded-md bg-white/[0.05] animate-pulse" />
          <div className="h-2.5 w-[85%] rounded-md bg-white/[0.05] animate-pulse" />
        </div>
      ) : null}
    </div>
  );
});
ReportStreamSkeleton.displayName = "ReportStreamSkeleton";

export default function AIGeneratedMarketsReport({
  generatedReport,
  userId,
  selectedReportId,
  reportGenLookupKey,
  selectedMarketTitle,
  selectedMarketImageUrl,
}: AIGeneratedMarketsReportProps) {
  const [inputMessage, setInputMessage] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLimitCode, setPaywallLimitCode] = useState<PaywallLimitCode | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const { data: selectedReportData } = useReportWithConversation(
    userId || undefined,
    selectedReportId
  );

  const activeReport = useMemo<MarketReport | null>(() => {
    if (!selectedReportId) {
      return null;
    }
    if (selectedReportData) {
      return {
        id: selectedReportData.id,
        marketTicker: selectedReportData.ticker,
        marketTitle:
          selectedReportData.projectName || selectedReportData.ticker,
        content: selectedReportData.content,
        createdAt: selectedReportData.createdAt,
        updatedAt: selectedReportData.updatedAt,
        marketData: selectedReportData.marketData || null,
      };
    }
    return generatedReport || null;
  }, [selectedReportData, generatedReport, selectedReportId]);

  const { messages, isSending, streamingContent, sendMessage, stopGeneration } =
    useRexChat({
      userId,
      report: activeReport,
      initialMessages: selectedReportData?.conversation?.messages || [],
    });

  const { isGenerating: isListingReportGenerating } = useReportGenStatus(
    reportGenLookupKey || undefined,
  );

  const generateReportCtx = useRexMarketsGenerateReportOptional();

  const { partialText } = useMarketReportStream(reportGenLookupKey);

  const preparedStreamMarkdown = useMemo(
    () => stripFeaturedImageAndTitleSections(partialText),
    [partialText],
  );

  const preparedReportMarkdown = useMemo(
    () => stripFeaturedImageAndTitleSections(activeReport?.content ?? ""),
    [activeReport?.content],
  );

  const headerTitle =
    activeReport?.marketTitle ||
    selectedMarketTitle?.trim() ||
    "Intelligence report";
  const headerImageUrl =
    pickMarketImageFromData(
      activeReport?.marketData,
      selectedMarketImageUrl ?? null,
    ) ?? null;

  // Check if user is near bottom of scroll container
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;
    const threshold = 100; // pixels from bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold;
    return isNearBottom;
  }, []);

  // Throttled scroll handler to reduce unnecessary updates
  const handleScroll = useCallback(() => {
    // Use requestAnimationFrame for smooth throttling
    if (scrollContainerRef.current) {
      shouldAutoScrollRef.current = checkIfNearBottom();
    }
  }, [checkIfNearBottom]);

  // Do not auto-scroll when the answer is generated — let the user scroll manually
  // (streaming, new messages, and streaming-finished scroll effects removed for better UX)

  // Scroll to top when a new report is generated
  useEffect(() => {
    if (activeReport?.id) {
      // Scroll to top of report content
      const container = endRef.current?.parentElement?.parentElement;
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [activeReport?.id]);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${Math.min(
        taRef.current.scrollHeight,
        MAX_H
      )}px`;
    }
  }, [inputMessage]);

  const handleSend = useCallback(async () => {
    if (!inputMessage.trim() || isSending || !activeReport) return;

    try {
      // Reset auto-scroll when sending a new message
      shouldAutoScrollRef.current = true;
      await sendMessage(inputMessage.trim());
      setInputMessage("");
    } catch (e: any) {
      if (e?.status === 402) {
        const code = (e?.code === "PAID_LIMIT_REACHED" ? "PAID_LIMIT_REACHED" : "FREE_LIMIT_REACHED") as PaywallLimitCode;
        setPaywallLimitCode(code);
        setShowPaywall(true);
      } else {
        console.error("Chat error:", e);
      }
    }
  }, [inputMessage, isSending, activeReport, sendMessage]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isSending) handleSend();
      }
    },
    [handleSend, isSending]
  );

  if (!activeReport) {
    if (isListingReportGenerating) {
      const genTitle =
        selectedMarketTitle?.trim() || "Preparing your report…";
      return (
        <div
          className="rex-pilot-panel text-white flex flex-col h-full relative overflow-hidden min-h-0"
          style={{ maxHeight: "100dvh" }}
        >
          <div
            className="flex-1 overflow-y-auto overflow-x-hidden custom-sidebar-scrollbar pb-6 pr-2 min-h-0 px-1 sm:px-0"
            style={{
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-y",
              overscrollBehavior: "contain",
            }}
          >
            <ReportMarketHeader
              title={genTitle}
              imageUrl={selectedMarketImageUrl ?? null}
            />
            {preparedStreamMarkdown.trim() ? (
              <div className="rex-markets-report-md">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={rehypePlugins}
                  components={markdownComponents}
                >
                  {preparedStreamMarkdown}
                </ReactMarkdown>
                <span
                  className="inline-block w-2 h-4 bg-[#ffc000]/85 animate-pulse ml-0.5 align-middle"
                  aria-hidden
                />
              </div>
            ) : null}
            <ReportStreamSkeleton compact={partialText.trim().length > 0} />
          </div>
        </div>
      );
    }
    return (
      <EmptyState
        onGenerateClick={
          generateReportCtx
            ? () => generateReportCtx.triggerGenerate()
            : undefined
        }
        generateDisabled={isListingReportGenerating}
      />
    );
  }

  return (
    <>
    <div
      className="rex-pilot-panel text-white flex flex-col h-full relative overflow-hidden min-h-0"
      style={{
        maxHeight: "100dvh", // Use dynamic viewport height for mobile
      }}
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden custom-sidebar-scrollbar pb-4 pr-2 min-h-0"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
          paddingBottom: "0.5rem", // Reduced padding on mobile
        }}
      >
        <ReportMarketHeader title={headerTitle} imageUrl={headerImageUrl} />
        <div className="rex-markets-report-md pl-1 sm:pl-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {preparedReportMarkdown}
          </ReactMarkdown>
        </div>

        {messages.length > 0 && (
          <div className="flex flex-col w-full">
            {messages.map((m, idx) => (
              <div
                key={`${m.timestamp}-${idx}`}
                className={`mb-4 ${
                  m.role === "user"
                    ? "flex items-start justify-end"
                    : "flex justify-end items-end"
                }`}
              >
                <div className="max-w-full p-4 rounded-lg break-words">
                  <div className="flex items-center gap-2 mb-2">
                    {m.role === "user" ? (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-500">
                        <span className="text-white text-xs">U</span>
                      </div>
                    ) : (
                      <div>
                        <AssistantAvatar />
                      </div>
                    )}
                  </div>
                  <div className="text-white/90 break-words">
                    {formatRexPilotChatLines(m.content)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {streamingContent && (
          <div className="mb-4 flex justify-end">
            <div className="p-4 rounded-lg max-w-full break-words">
              <div className="flex items-center">
                <AssistantAvatar />
              </div>
              <div className="text-white/90 break-words">
                {formatRexPilotChatLines(streamingContent)}
                <span className="inline-block w-2 h-4 bg-white/60 animate-pulse ml-1" />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div
        className="flex-shrink-0 w-full flex justify-center px-4 sm:px-8 pb-2 sm:pb-2"
        style={{
          paddingBottom: "0.5rem", // Consistent padding on mobile
          position: "sticky",
          bottom: 0,
          backgroundColor: "#141414",
          zIndex: 10,
        }}
      >
        <div className="relative w-full sm:w-[80%]">
          <textarea
            ref={taRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask any follow-up questions!"
            disabled={isSending}
            className="w-full max-w-full bg-[#262626] border-[0.5px] border-[#3C3C3C] text-[#BEBEBE] placeholder-[#BEBEBE] rounded-[8px] pl-4 pr-20 py-2.5 resize-none outline-none disabled:opacity-50 min-h-[50px] max-h-[200px] break-words text-[15px] leading-[1.65]"
            rows={2}
            aria-label="Message input"
          />
          {isSending ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-4 w-4 fill-current text-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputMessage.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white font-semibold rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              aria-label="Send message"
            >
              <Image
                src="/images/banner.png"
                width={40}
                height={40}
                alt="Send"
                className="scale-100 transition-transform duration-300"
              />
            </button>
          )}
        </div>
      </div>
    </div>
    <PaywallModal
      open={showPaywall}
      onClose={() => {
        setShowPaywall(false);
        setPaywallLimitCode(null);
      }}
      context="rexmarkets"
      limitCode={paywallLimitCode ?? undefined}
      paymentMetadata={userId ? { userId } : undefined}
    />
    </>
  );
}
