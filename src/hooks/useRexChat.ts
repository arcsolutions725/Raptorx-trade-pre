/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import type { MarketReport } from "./useGenerateMarketReport";
import { useAppendMessage } from "./useReports";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type UseRexChatOptions = {
  userId?: string | null;
  report?: MarketReport | null;
  initialMessages?: Array<{
    id?: string;
    role: "user" | "assistant";
    content: string;
    timestamp?: string | Date;
  }>;
};

function isAbortError(e: unknown): boolean {
  return (
    (e as { name?: string })?.name === "AbortError" ||
    (e as { cause?: { name?: string } })?.cause?.name === "AbortError" ||
    (typeof DOMException !== "undefined" &&
      e instanceof DOMException &&
      e.name === "AbortError")
  );
}

export function useRexChat(opts: UseRexChatOptions = {}) {
  const { report, userId, initialMessages } = opts;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const appendMessage = useAppendMessage(userId || "");
  const prevInitialMessagesRef = useRef<string>("");

  // Only use appendMessage if userId is available
  const canSaveMessages = !!userId && !!report?.id;

  // Load initial messages from database conversation
  useEffect(() => {
    // Create a stable serialized version for comparison
    const serialized = JSON.stringify(
      initialMessages?.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp:
          typeof m.timestamp === "string"
            ? m.timestamp
            : m.timestamp instanceof Date
            ? m.timestamp.toISOString()
            : undefined,
      })) || []
    );

    // Only update if the content actually changed
    if (serialized !== prevInitialMessagesRef.current) {
      prevInitialMessagesRef.current = serialized;

      if (initialMessages && initialMessages.length > 0) {
        const formattedMessages: Message[] = initialMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp:
            typeof m.timestamp === "string"
              ? m.timestamp
              : m.timestamp instanceof Date
              ? m.timestamp.toISOString()
              : new Date().toISOString(),
        }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    }
  }, [initialMessages]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || !report || !report.id || !userId) {
        throw new Error("Missing message, report, or user ID.");
      }

      if (inFlightRef.current) return;

      setError(null);
      inFlightRef.current = true;
      setIsSending(true);
      setStreamingContent("");

      const controller = new AbortController();
      abortControllerRef.current = controller;
      let acc = "";

      try {
        // Add user message to history
        const nowIso = new Date().toISOString();
        const userMsg: Message = {
          role: "user",
          content: userMessage.trim(),
          timestamp: nowIso,
        };
        setMessages((prev) => [...prev, userMsg]);

        // Save user message to database if userId is available
        if (canSaveMessages) {
          await appendMessage.mutateAsync({
            reportId: report.id,
            role: "user",
            content: userMessage.trim(),
            timestamp: nowIso,
          });
        }

        // Build history for context
        const history = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Call API
        const resp = await fetch("/api/market-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage.trim(),
            reportData: report.content,
            marketTicker: report.marketTicker,
            marketTitle: report.marketTitle,
            marketData: report.marketData,
            history,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) throw new Error("Failed to get response");

        const reader = resp.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            setStreamingContent(acc);
          }
        }

        // Add assistant message to history
        const assistantMsg: Message = {
          role: "assistant",
          content: acc,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingContent("");

        // Save assistant message to database if userId is available
        if (canSaveMessages) {
          await appendMessage.mutateAsync({
            reportId: report.id,
            role: "assistant",
            content: acc,
            timestamp: new Date().toISOString(),
          });
        }

        return acc;
      } catch (err: unknown) {
        if (isAbortError(err)) {
          if (acc.trim()) {
            const stoppedContent = `${acc.trim()}\n\n_Generation stopped._`;
            const assistantMsg: Message = {
              role: "assistant",
              content: stoppedContent,
              timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setStreamingContent("");
            if (canSaveMessages) {
              try {
                await appendMessage.mutateAsync({
                  reportId: report.id,
                  role: "assistant",
                  content: stoppedContent,
                  timestamp: new Date().toISOString(),
                });
              } catch (persistErr) {
                console.error("Failed to save partial reply:", persistErr);
              }
            }
          } else {
            setStreamingContent("");
          }
          return acc;
        }
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to send message.";
        setError(msg);
        throw err;
      } finally {
        abortControllerRef.current = null;
        setIsSending(false);
        inFlightRef.current = false;
        setStreamingContent("");
      }
    },
    [report, messages, userId, appendMessage, canSaveMessages]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
    setError(null);
  }, []);

  return {
    messages,
    isSending,
    streamingContent,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  };
}
