"use client";

import { useCallback, useEffect, useRef, useState, useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import Image from "next/image";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useRexChat } from "@/hooks/useRexChat";
import { useReportWithConversation } from "@/hooks/useReports";
import { PaywallModal, type PaywallLimitCode } from "@/components/ui/modal/PaywallModal";
import { useReportGenStatus } from "@/lib/storage/reportGenStore";
import { useMarketReportStream } from "@/lib/storage/marketReportStreamStore";
import { stripFeaturedImageAndTitleSections } from "@/lib/rexmarkets/reportMarkdownDisplay";
import { useRexMarketsGenerateReportOptional } from "@/app/rexmarkets/_components/RexMarketsGenerateReportContext";
import { AskBar, ClawIco, IconDoc, QaThread, SkeletonLines } from "./pilotUi";

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

/** No report yet (design/market.html #newsBody .empty): claw mark, "Rex Markets", Generate. */
const EmptyState = memo(
  ({
    onGenerateClick,
    generateDisabled = false,
  }: EmptyStateProps) => (
    <div className="sb-body">
      <div className="empty">
        <span className="empty__mark" aria-hidden="true">
          <ClawIco size={34} />
        </span>
        <b>Rex Markets</b>
        <p>
          Conversational intelligence for event traders. Generate an intelligence report for any
          prediction event.
        </p>
        {onGenerateClick && (
          <button
            type="button"
            onClick={() => void onGenerateClick()}
            disabled={generateDisabled}
            className="rx-btn rx-btn--report"
            aria-label="Generate news intelligence report"
          >
            <span className="text-rx-gold">
              <IconDoc />
            </span>
            Generate
          </button>
        )}
      </div>
    </div>
  )
);
EmptyState.displayName = "EmptyState";

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
    <div className="rep-head">
      <div className="rep-head__img">
        {imageUrl && !imgErr ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover object-center"
            sizes="44px"
            unoptimized={
              imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
            }
            onError={() => setImgErr(true)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-rx-gold">
            <IconDoc size={16} />
          </span>
        )}
      </div>
      <h2>{title}</h2>
    </div>
  );
});
ReportMarketHeader.displayName = "ReportMarketHeader";

/** While the report is written (prototype "Generate" state): note + skeleton lines. */
const ReportStreamSkeleton = memo(function ReportStreamSkeleton({
  compact,
}: {
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="mt-5 opacity-60">
        <SkeletonLines widths={[84, 60, 72]} />
      </div>
    );
  }
  return (
    <div>
      <p className="rx-small" style={{ margin: "0 0 14px" }}>
        Claw is reading the latest news for this market…
      </p>
      <SkeletonLines />
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
      const container = scrollContainerRef.current;
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
        <div className="sb-body" aria-busy="true">
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
              <span className="rep-caret" aria-hidden="true" />
            </div>
          ) : null}
          <ReportStreamSkeleton compact={partialText.trim().length > 0} />
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
      <div ref={scrollContainerRef} onScroll={handleScroll} className="sb-body">
        <ReportMarketHeader title={headerTitle} imageUrl={headerImageUrl} />
        <div className="rex-markets-report-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {preparedReportMarkdown}
          </ReactMarkdown>
        </div>

        {/* Follow-up questions about the report and Rex Pilot answers */}
        <QaThread messages={messages} streaming={streamingContent} />
        <div ref={endRef} />
      </div>

      <AskBar
        value={inputMessage}
        onChange={setInputMessage}
        onSend={handleSend}
        onStop={stopGeneration}
        onKeyDown={onKeyDown}
        isSending={isSending}
        placeholder="Ask a follow-up question"
        label="Ask a follow-up question about this report"
        taRef={taRef}
      />
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
