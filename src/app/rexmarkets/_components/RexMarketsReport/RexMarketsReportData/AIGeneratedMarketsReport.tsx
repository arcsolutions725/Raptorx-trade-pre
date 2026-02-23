"use client";

import { useCallback, useEffect, useRef, useState, useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import Image from "next/image";
import type { MarketReport } from "@/hooks/useGenerateMarketReport";
import { useRexChat } from "@/hooks/useRexChat";
import { useReportWithConversation, useReports } from "@/hooks/useReports";

type AIGeneratedMarketsReportProps = {
  generatedReport?: MarketReport | null;
  userId?: string | null;
  selectedReportId?: string | null;
  onViewHistory?: () => void;
};

const MAX_H = 200;

// Memoized rehype plugins array
const rehypePlugins = [rehypeRaw];

// Memoized markdown components to prevent recreation on every render
const markdownComponents = {
  h1: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-2xl font-bold text-[#ffc000] mb-4" {...props} />
  ),
  h2: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-xl font-bold text-[#ffc000] mb-3 mt-6" {...props} />
  ),
  h3: ({ ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-lg font-bold text-white mb-2 mt-4" {...props} />
  ),
  p: ({ ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-white/90 mb-4 leading-relaxed" {...props} />
  ),
  ul: ({ ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside mb-4 space-y-2" {...props} />
  ),
  ol: ({ ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside mb-4 space-y-2" {...props} />
  ),
  li: ({ ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-white/90" {...props} />
  ),
  strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className="text-[#ffc000] font-bold" {...props} />
  ),
  em: ({ ...props }: React.HTMLAttributes<HTMLElement>) => (
    <em className="text-[#ffc000]" {...props} />
  ),
  a: ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-[#ffc000] underline hover:text-[#ffda44]"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
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
  onViewHistory?: () => void;
  reportsCount?: number;
};

const EmptyState = memo(
  ({ onViewHistory, reportsCount = 0 }: EmptyStateProps) => (
    <div className="flex flex-col items-center justify-center h-full gap-10 px-10">
      <header className="flex flex-col items-center justify-center">
        <div className="flex items-end">
          <Image
            src="/images/rexmarket.png"
            alt="Rex Market"
            width={140}
            height={140}
            priority
          />
        </div>
        <div className="flex flex-col gap-8 items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-2">
            <h1 className="max-w-[600px] w-full !font-normal !text-[14px] sm:!text-[18px] text-center text-white">
              Conversational Intelligence for Event-Traders.
            </h1>
            <h4 className="max-w-[600px] w-full !text-[12px] sm:!text-[14px] !font-normal text-[#F2F2F2] text-center">
              Click <span className="text-[#00B050]">Generate</span> to get
              Intelligence Reports for any prediction event!
            </h4>
          </div>
          {reportsCount > 0 && onViewHistory && (
            <button
              onClick={onViewHistory}
              className="cursor-pointer transition hover:scale-[1.05]"
              aria-label="View Report History"
            >
              <Image
                src={"/images/history.png"}
                alt="report history"
                width={140}
                height={80}
                className="w-[100px] h-[40px] sm:w-[80px] sm:h-[34px] md:w-[100px] md:h-[40px]"
              />
            </button>
          )}
        </div>
      </header>
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

export default function AIGeneratedMarketsReport({
  generatedReport,
  userId,
  selectedReportId,
  onViewHistory,
}: AIGeneratedMarketsReportProps) {
  const [inputMessage, setInputMessage] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const { data: selectedReportData } = useReportWithConversation(
    userId || undefined,
    selectedReportId
  );

  const { data: serverReports = [] } = useReports(
    userId || undefined,
    "market"
  );

  const activeReport = useMemo<MarketReport | null>(() => {
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
  }, [selectedReportData, generatedReport]);

  const { messages, isSending, streamingContent, sendMessage } = useRexChat({
    userId,
    report: activeReport,
    initialMessages: selectedReportData?.conversation?.messages || [],
  });

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
    } catch (e) {
      console.error("Chat error:", e);
    }
  }, [inputMessage, isSending, activeReport, sendMessage]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Memoized formatMessage to prevent recreation on every render
  const formatMessage = useCallback((content: string) => {
    return content.split("\n").map((line, i) => {
      const html = line
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
        .replace(/^---+$/, "");
      if (!html.trim()) return null;
      return (
        <div key={i} className="mb-2">
          {html.startsWith("## ") ? (
            <h3 className="mt-4 mb-2">
              <span dangerouslySetInnerHTML={{ __html: html.substring(3) }} />
            </h3>
          ) : html.startsWith("### ") ? (
            <h4 className="text-md font-semibold mt-3 mb-1">
              <span dangerouslySetInnerHTML={{ __html: html.substring(4) }} />
            </h4>
          ) : html.startsWith("- ") ? (
            <div className="ml-4 text-[18px]">
              • <span dangerouslySetInnerHTML={{ __html: html.substring(2) }} />
            </div>
          ) : (
            <span
              className="text-[18px]"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      );
    });
  }, []);

  if (!activeReport) {
    return (
      <EmptyState
        onViewHistory={onViewHistory}
        reportsCount={serverReports.length}
      />
    );
  }

  return (
    <div
      className="text-white flex flex-col h-full relative overflow-hidden min-h-0"
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
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {activeReport.content}
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
                    {formatMessage(m.content)}
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
                {formatMessage(streamingContent)}
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
            className="w-full max-w-full bg-[#262626] border-[0.5px] border-[#3C3C3C] text-[#BEBEBE] placeholder-[#BEBEBE] rounded-[8px] pl-4 pr-20 py-2.5 resize-none outline-none disabled:opacity-50 min-h-[50px] max-h-[200px] break-words text-[14px]"
            rows={2}
            aria-label="Message input"
          />
          <button
            onClick={handleSend}
            disabled={!inputMessage.trim() || isSending}
            className="absolute right-2 bottom-0 transform -translate-y-1/3 text-white font-semibold rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            aria-label="Send message"
          >
            <Image
              src="/images/banner.png"
              width={40}
              height={40}
              alt="Send"
              className={`transition-transform duration-300 ${
                isSending ? "scale-125 animate-pulse" : "scale-100"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
