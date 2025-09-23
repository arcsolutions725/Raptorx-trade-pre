/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Check, RotateCcw, ArrowLeft } from "lucide-react";
import copy from "copy-to-clipboard";
import {
  useReportWithConversation,
  useAppendMessage,
} from "@/hooks/useReports";
import { useRegenerateReport } from "@/hooks/useRegenerateReport";
import { CoinOMetry } from "@/components/CoinOMetry";

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative?: string;
  priceUsd?: string;
  volume?: { h24: number; h6: number; h1: number; m5?: number };
  liquidity?: { usd: number; base: number; quote: number };
  txns?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h6?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    header?: string;
    openGraph?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}
function isDexScreenerPair(data: unknown): data is DexScreenerPair {
  if (!data || typeof data !== "object") return false;
  const o = data as any;
  return o?.baseToken?.symbol && o?.quoteToken?.symbol;
}

// type MessageRole = "user" | "assistant";
type Props = {
  userId: string;
  reportId: string;
  /** Optional: navigate back to analysis / indicator view */
  onBack?: () => void;
};

const COPY_MS = 500;
const MAX_H = 200;

export default function ChatInterface({ userId, reportId, onBack }: Props) {
  const {
    data: reportData,
    isLoading,
    isFetching,
    refetch,
  } = useReportWithConversation(userId, reportId);
  const appendMessage = useAppendMessage(userId);

  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  // Regenerate state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasRegenerated, setHasRegenerated] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const regenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // useEffect(() => {
  //   endRef.current?.scrollIntoView({ behavior: "smooth" });
  // }, [reportData?.conversation?.messages?.length, streamingContent]);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = `${Math.min(
        taRef.current.scrollHeight,
        MAX_H
      )}px`;
    }
  }, [inputMessage]);

  const dexData: DexScreenerPair | undefined = useMemo(() => {
    const dd = reportData?.dexData as unknown;
    return isDexScreenerPair(dd) ? (dd as DexScreenerPair) : undefined;
  }, [reportData?.dexData]);

  /* ---------------------------------------------------------------------- */
  /* Timestamp helper                                                       */
  /* ---------------------------------------------------------------------- */
  function formatRelativeTime(iso: string | Date): string {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffSec < 60) return "Updated just now";
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    if (diffHr < 24)
      return `Updated ${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
    if (diffDay < 7)
      return `Updated ${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
    return `Updated on ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  /* ---------------------------------------------------------------------- */
  /* Regenerate logic                                                       */
  /* ---------------------------------------------------------------------- */
  const {
    isRegenerating,
    error: regenerateError,
    regenerateReport,
  } = useRegenerateReport({
    userId,
    onReportRegenerated: () => {
      setHasRegenerated(true);
      refetch();
    },
  });

  // Start countdown when regeneration begins
  useEffect(() => {
    if (isRegenerating && countdown === null) {
      setCountdown(100);
    } else if (!isRegenerating && countdown !== null) {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isRegenerating, countdown]);

  // Countdown timer logic
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) return isRegenerating ? 100 : null;
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [countdown, isRegenerating]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (regenTimeoutRef.current) {
        clearTimeout(regenTimeoutRef.current);
        regenTimeoutRef.current = null;
      }
    };
  }, []);

  // Auto-hide "Regenerated!" badge after 2 seconds
  useEffect(() => {
    if (hasRegenerated) {
      // clear any existing timeout first
      if (regenTimeoutRef.current) clearTimeout(regenTimeoutRef.current);
      regenTimeoutRef.current = setTimeout(() => {
        setHasRegenerated(false);
        regenTimeoutRef.current = null;
      }, 2000);
    }
  }, [hasRegenerated]);

  const handleRegenerate = async () => {
    try {
      setHasRegenerated(false);
      setCountdown(100);
      await regenerateReport({ reportId });
    } catch (err) {
      console.error("Failed to regenerate report:", err);
      setCountdown(null);
    }
  };

  const logo = dexData?.info?.imageUrl;
  const headerImage = dexData?.info?.header;
  const websites = dexData?.info?.websites || [];
  const socials = dexData?.info?.socials || [];

  console.log(dexData?.info, logo, "werwerewewer");

  const formatMessage = (content: string) =>
    content.split("\n").map((line, i) => {
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

  function renderMarkdownSection(body: string): React.ReactNode {
    const lines = body.split("\n");
    return lines.map((line, idx) => {
      if (!line.trim()) return <div key={idx} className="h-3" />;
      if (line.startsWith("### ")) {
        const header = line
          .substring(4)
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.*?)\*/g, "<strong>$1</strong>");
        return (
          <h3
            key={idx}
            className="text-lg font-semibold text-white mt-4 mb-2"
            dangerouslySetInnerHTML={{ __html: header }}
          />
        );
      }
      const processed = line
        .replace(/\*\*(.*?)\*\*/g, "<span>$1</span>")
        .replace(/\*(.*?)\*/g, "<span>$1</span>");

      if (line.trim().startsWith("- ")) {
        const bullet = line
          .substring(2)
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.*?)\*/g, "<strong>$1</strong>");
        return (
          <div key={idx} className="ml-4 text-white/90 mb-2">
            • <span dangerouslySetInnerHTML={{ __html: bullet }} />
          </div>
        );
      }
      return (
        <p
          key={idx}
          className="text-white/90 mb-3"
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      );
    });
  }

  function renderTweetsSection(text: string): React.ReactNode {
    const lines = text.split("\n").filter(Boolean);
    if (text.toLowerCase().includes("no tweet data available")) {
      return (
        <div className="text-center py-8 text-white/60">
          <div className="text-4xl mb-2">🐦</div>
          <p>No tweet data available for analysis</p>
        </div>
      );
    }
    const blocks: string[] = [];
    let curr = "";
    lines.forEach((l) => {
      if ((l.startsWith("**") || l.startsWith("*")) && l.includes(":")) {
        if (curr) blocks.push(curr);
        curr = l;
      } else if (curr) {
        curr += "\n" + l;
      }
    });
    if (curr) blocks.push(curr);

    return (
      <div className="space-y-4">
        {blocks.map((tweet, idx) => {
          const [uLine, ...rest] = tweet.split("\n");
          const username = uLine.replace(/\*+/g, "").replace(":", "");
          const body = rest
            .join(" ")
            .trim()
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<strong>$1</strong>");

          return (
            <div
              key={idx}
              className="bg-black/20 rounded-lg p-4 border-l-4 border-blue-400"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">
                    {username.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-blue-300 mb-2">
                    {username}
                  </div>
                  <p
                    className="text-white/90 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: body }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function getSectionIcon(title: string): React.ReactNode {
    const t = title.toLowerCase();
    if (t.includes("what it is"))
      return (
        <Image src={"/images/leaf.png"} alt="leaf" width={25} height={25} />
      );
    if (t.includes("community chatter"))
      return (
        <Image
          src={"/images/communitychatter.png"}
          alt="community"
          width={35}
          height={35}
        />
      );
    if (t.includes("coin-o-metry"))
      return (
        <Image
          src={"/images/coinmetry.png"}
          alt="coinometry"
          width={35}
          height={35}
        />
      );
    if (t.includes("technical analysis")) return "📈";
    return "📄";
  }

  function renderSectionContent(title: string, lines: string[]) {
    const t = title.toLowerCase();
    const body = lines.join("\n");
    if (t.includes("individual tweets")) return renderTweetsSection(body);
    if (t.includes("coin-o-metry"))
      return dexData ? <CoinOMetry dexData={dexData} /> : "";
    return renderMarkdownSection(body);
  }

  function formatStructuredReport(text: string): React.ReactNode {
    const lines = text.split("\n");
    let cur = "";
    const sections: Record<string, string[]> = {};

    lines.forEach((line) => {
      if (line.startsWith("## ")) {
        const raw = line.substring(3).trim();
        cur = raw.replace(/^\d+\.\s*/, "");
        sections[cur] = [];
      } else if (cur && line.trim()) {
        sections[cur].push(line);
      }
    });

    return (
      <div className="space-y-8">
        {Object.entries(sections).map(([title, body], i) => (
          <div key={i}>
            <h2 className="text-white mb-4 flex items-center gap-3">
              {title}
              {getSectionIcon(title)}
            </h2>
            <div className="space-y-3">{renderSectionContent(title, body)}</div>
          </div>
        ))}
      </div>
    );
  }

  /* -----------------------  Regenerate Button  ------------------------- */
  function RegenerateButton() {
    const title = isRegenerating
      ? `Regenerating... ${countdown}s remaining`
      : hasRegenerated
      ? "Report regenerated!"
      : "Re-generate Report";

    return (
      <button
        onClick={handleRegenerate}
        disabled={isRegenerating}
        className={`mr-2 p-1 rounded transition relative ${
          isRegenerating ? "opacity-70 cursor-wait" : ""
        }`}
        title={title}
        aria-label={title}
      >
        {isRegenerating && countdown !== null ? (
          <div className="flex items-center justify-center w-[50px] h-[50px]">
            <div className="text-[#FFD700] font-bold text-lg animate-pulse">
              {countdown}s
            </div>
          </div>
        ) : hasRegenerated ? (
          <div className="flex items-center justify-center rounded-sm bg-[#FFD700] px-2 py-1">
            <span className="text-black !font-bold text-xs">Regenerated!</span>
          </div>
        ) : (
          <RotateCcw className="w-6 h-6 text-white hover:text-[#FFD700] transition-colors" />
        )}
      </button>
    );
  }

  function CopyReportButton({ reportContent }: { reportContent: string }) {
    const [copied, setCopied] = useState(false);
    const onCopy = useCallback(() => {
      copy(reportContent);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_MS);
    }, [reportContent]);

    return (
      <button
        onClick={onCopy}
        className="ml-auto p-1 rounded transition relative z-50"
        title={copied ? "Copied!" : "Copy Report"}
        aria-label={copied ? "Copied!" : "Copy Report"}
      >
        {copied ? (
          <Check className="w-12.5 h-12.5 text-white transition-transform" />
        ) : (
          <Image
            src={"/images/copy.png"}
            alt="copy button"
            width={50}
            height={50}
          />
        )}
      </button>
    );
  }

  const handleSend = useCallback(async () => {
    if (!inputMessage.trim() || sending || !reportData?.id) return;

    const nowIso = new Date().toISOString();
    try {
      setSending(true);
      setStreamingContent("");

      await appendMessage.mutateAsync({
        reportId,
        role: "user",
        content: inputMessage.trim(),
        timestamp: nowIso,
      });

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          message: inputMessage.trim(),
          reportData: reportData.content,
          contractAddress: reportData.contractAddress,
          ticker: reportData.ticker,
          projectName: reportData.projectName,
        }),
      });

      setInputMessage("");

      if (!resp.ok) throw new Error("Failed to get response");
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreamingContent(acc);
        }
      }

      await appendMessage.mutateAsync({
        reportId,
        role: "assistant",
        content: acc,
        timestamp: new Date().toISOString(),
      });

      setStreamingContent("");
    } catch (e) {
      console.error("Chat error:", e);
    } finally {
      setSending(false);
    }
  }, [inputMessage, sending, appendMessage, reportData, reportId]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  if (isLoading || isFetching) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/60">Loading…</div>
      </div>
    );
  }
  if (!reportData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/60">No report selected</div>
      </div>
    );
  }

  const msgs = reportData?.conversation?.messages || [];

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full w-full max-w-[1440px] mx-auto overflow-x-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 pb-32">
        {onBack && (
          <div className="mb-4 mt-4">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-white/70 hover:text-white transition cursor-pointer"
              aria-label="Back to Generate Report"
              title="Back"
            >
              <ArrowLeft className="w-7 h-7" />
              <span className="text-xl">Back</span>
            </button>
          </div>
        )}
        <div className="mb-6 p-6 rounded-lg relative max-w-full">
          <div className="flex flex-col w-full justify-center items-center gap-4 mb-6">
            <div className="flex items-center gap-5">
              {logo && (
                <Image
                  src={logo}
                  alt="Token Logo"
                  width={60}
                  height={60}
                  className="rounded-full border border-white/10"
                />
              )}
              <h2 className="text-white text-[32px]">
                Ticker: {reportData.ticker}{" "}
                {reportData.projectName ? `(${reportData.projectName})` : ""}
              </h2>
            </div>

            {/* Last updated timestamp (placed outside row for proper centering) */}
            <p className="text-sm text-white/60 -mt-2 text-center w-full">
              {formatRelativeTime(reportData.updatedAt)}
            </p>

            <div className="flex flex-col gap-5">
              {headerImage && (
                <Image
                  src={headerImage}
                  alt="Header"
                  width={300}
                  height={100}
                  className="rounded-lg border border-white/10 object-cover"
                />
              )}
              <div className="flex fle-row justify-center w-full gap-8 mt-1">
                {websites?.[0]?.url && (
                  <a
                    href={websites[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/60 hover:text-white transition"
                  >
                    <Image
                      src={"/images/earth.png"}
                      alt="earth png"
                      width={28}
                      height={25}
                    />
                  </a>
                )}
                {socials?.map((s, idx) => {
                  if (!s.url) return null;
                  const isX = s.type === "twitter";
                  const isTg = s.type === "telegram";
                  const icon = isX
                    ? "/images/x.png"
                    : isTg
                    ? "/images/telegram.png"
                    : null;
                  if (!icon) return null;
                  return (
                    <a
                      key={idx}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/60 hover:text-white transition"
                    >
                      <Image
                        src={icon}
                        alt={`${s.type} icon`}
                        width={25}
                        height={25}
                      />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="w-full flex justify-center">
            {/* Regenerate button (left) and Copy button (right) */}
            <RegenerateButton />
            <CopyReportButton reportContent={reportData.content} />
          </div>

          <div className="text-white/90 text-xl whitespace-pre-wrap break-words overflow-x-hidden">
            {formatStructuredReport(reportData.content)}
          </div>
        </div>

        <div className="flex flex-col w-full">
          {msgs.map((m: any) => (
            <div
              key={m.id}
              className={`mb-4 ${
                m.role === "user"
                  ? "flex items-start justify-end"
                  : "flex justify-end items-end"
              }`}
            >
              <div className="max-w-full p-4 rounded-lg break-words">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      m.role === "user" ? "bg-blue-500" : "bg-transparent"
                    }`}
                  >
                    {m.role === "user" ? (
                      <span className="text-white text-xs">U</span>
                    ) : (
                      <Image
                        src="/images/banner.png"
                        alt="Assistant avatar"
                        width={40}
                        height={40}
                      />
                    )}
                  </div>
                </div>
                <div className="text-white/90 break-words">
                  {formatMessage(m.content)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {streamingContent && (
          <div className="mb-4 flex justify-end">
            <div className="p-4 rounded-lg max-w-full break-words">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <span className="text-white text-xs">A</span>
                </div>
                <span className="text-white/70 text-sm">Assistant</span>
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

      <div className="p-4 w-full max-w-[1440px] mx-auto">
        <div className="relative">
          <textarea
            ref={taRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask any follow-up questions!"
            disabled={sending}
            className="w-full max-w-full bg-white shadow-xl/30 text-[16px] text-black/40 placeholder-black/40 rounded-2xl pl-4 pr-20 py-3 resize-none outline-none focus:ring-2 disabled:opacity-50 min-h-[50px] max-h-[200px] break-words"
            rows={3}
            aria-label="Message input"
          />
          <button
            onClick={handleSend}
            disabled={!inputMessage.trim() || sending}
            className="absolute right-2 bottom-0 transform -translate-y-1/2 text-white font-semibold rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            aria-label="Send message"
          >
            <Image
              src="/images/banner.png"
              width={40}
              height={40}
              alt="Send button"
              className={`transition-transform duration-300 ${
                sending ? "scale-125 animate-pulse" : "scale-100"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
