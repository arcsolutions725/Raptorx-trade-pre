"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { Share2, Menu, Loader2 } from "lucide-react";
import Image from "next/image";
import copy from "copy-to-clipboard";
import ChatSidebar, {
  clawV5HeaderNavShiftPx,
} from "../_components/chat/ChatSidebar";
import ChatInput, {
  type PredictionMarketMode,
  type ClawSelectionContext,
} from "../_components/chat/ChatInput";
import {
  CLAW_V5_PENDING_STREAM_KEY,
  cryptotechFenceClosedAndParses,
  recomputeClawStreamingAssistantText,
} from "@/lib/clawV5/streamingReportDisplay";
import Message, { MessageData } from "../_components/chat/Message";
import { CryptoSwapPanel } from "../_components/chat/CryptoSwapPanel";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import {
  getChatsFromStorage,
  saveChatToStorage,
  getChatFromStorage,
  deleteChatFromStorage,
  Chat,
} from "@/lib/storage/chatStorage";
import {
  showErrorNotification,
  showSuccessNotification,
} from "@/components/ui/notification";
import { PaywallModal, type PaywallLimitCode } from "@/components/ui/modal/PaywallModal";
import { createNdjsonAccumulator } from "@/lib/clawV5/ndjsonStream";
import { createStreamRafBatcher } from "@/lib/clawV5/streamRaf";

export default function ChatDetailPage() {
  const router = useRouter();
  const params = useParams();
  const chatId = params.id as string;

  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    ready,
  } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } =
    usePhantomConnect();
  const authenticated = privyAuthenticated || phantomAuthenticated;

  // Initialize chats from localStorage immediately to prevent "No chats yet" flash
  const [chats, setChats] = useState<Chat[]>(() => {
    if (typeof window !== "undefined") {
      return getChatsFromStorage();
    }
    return [];
  });
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [streamingPhase, setStreamingPhase] = useState<
    "" | "markets" | "report" | "research" | "draft" | "synth"
  >("");
  const [streamingStatusLabel, setStreamingStatusLabel] = useState<string>("");
  const [streamingThinking, setStreamingThinking] = useState<string>("");
  const thinkingDraftSeparatorPendingRef = useRef(false);
  /** Coalesce web-research + draft token deltas to one React update per frame (reduces jank). */
  const thinkingDeltaQueueRef = useRef<{ phase: string; text: string }[]>([]);
  const thinkingDeltaRafRef = useRef<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [quotedContent, setQuotedContent] = useState<string | undefined>(
    undefined,
  );
  const [marketMode, setMarketMode] = useState<PredictionMarketMode>("Markets");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatSidebarCollapsed, setIsChatSidebarCollapsed] = useState(false);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [activeCryptoPayload, setActiveCryptoPayload] = useState<any | null>(
    null,
  );
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLimitCode, setPaywallLimitCode] = useState<PaywallLimitCode | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessageIdsRef = useRef<Set<string>>(new Set());
  const initialMessagesCapturedRef = useRef(false);
  const openedSwapForMessageIdsRef = useRef<Set<string>>(new Set());
  const hadStreamingRef = useRef(false);
  /** When true, never auto-scroll this session (e.g. after redirect from main page post-generation). Cleared when user sends. */
  const skipInitialScrollRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handleSendMessageRef = useRef<
    | ((
        message: string,
        quotedContent?: string,
        context?: ClawSelectionContext,
        opts?: { userId?: string; onServerContact?: () => void },
      ) => Promise<void>)
    | null
  >(null);
  const pendingInitialStreamStartedRef = useRef(false);
  /** Avoid GET /chats/:id during landing→detail handoff (React Strict remount + in-flight stream). */
  const skipServerChatFetchUntilSendDoneRef = useRef<string | null>(null);
  /** True while sessionStorage still has a landing→detail first message for this chat. */
  const [sessionPendingForChat, setSessionPendingForChat] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(CLAW_V5_PENDING_STREAM_KEY);
      if (!raw) {
        setSessionPendingForChat(false);
        return;
      }
      const p = JSON.parse(raw) as { chatId?: string };
      setSessionPendingForChat(p?.chatId === chatId);
    } catch {
      setSessionPendingForChat(false);
    }
  }, [chatId]);

  const findLatestCryptoPayload = useCallback((msgs: MessageData[]) => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "assistant" || !m.content) continue;
      const match = m.content.match(/```cryptotech\s*([\s\S]*?)```/i);
      if (!match?.[1]) continue;
      try {
        const payload = JSON.parse(match[1]);
        if (payload?.kind === "indicator" && payload?.analysis) return payload;
        if (payload?.kind === "technical_report" && payload?.token) return payload;
      } catch {
        // ignore parse errors
      }
    }
    return null;
  }, []);

  // Extract contract/mint from text and infer chain for swap prefill.
  // For generic 0x addresses, default to Ethereum unless chain keywords say otherwise.
  const extractContractFromText = useCallback((text: string): { address: string; chainId: string } | null => {
    const t = (text || "").trim();
    if (!t) return null;
    const evmWord = /^0x[a-fA-F0-9]{40}$/;
    const solanaWord = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    const evmAny = /0x[a-fA-F0-9]{40}/g;
    const solanaAny = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
    const lower = t.toLowerCase();

    const inferEvmChain = (): "bsc" | "base" | "monad" | "ethereum" => {
      if (
        lower.includes(" bsc") ||
        lower.includes("bnb chain") ||
        lower.includes("binance smart chain")
      ) {
        return "bsc";
      }
      if (lower.includes(" base")) return "base";
      if (lower.includes("monad")) return "monad";
      return "ethereum";
    };

    const words = t.split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[.,;:!?)]+$/, "").trim();
      if (evmWord.test(clean)) return { address: clean, chainId: inferEvmChain() };
      if (solanaWord.test(clean)) return { address: clean, chainId: "solana" };
    }
    const evmMatch = t.match(evmAny);
    if (evmMatch?.[0]) return { address: evmMatch[0], chainId: inferEvmChain() };
    const solMatch = t.match(solanaAny);
    if (solMatch?.[0]) return { address: solMatch[0], chainId: "solana" };
    return null;
  }, []);

  // Removed memoization - ChatSidebar no longer uses memo, so direct chats prop is fine

  // Do not auto-scroll when the AI answer is generating or just finished — user scrolls manually
  useEffect(() => {
    if (isSending) {
      hadStreamingRef.current = true;
      return;
    }
    // Once per page load: if we landed here after redirect from main page, never auto-scroll until user sends
    if (
      typeof window !== "undefined" &&
      sessionStorage.getItem("claw-v5-skip-initial-scroll") === chatId
    ) {
      sessionStorage.removeItem("claw-v5-skip-initial-scroll");
      skipInitialScrollRef.current = true;
      return;
    }
    if (skipInitialScrollRef.current) {
      return;
    }
    if (hadStreamingRef.current) {
      hadStreamingRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, chatId]);

  // Fetch user ID
  useEffect(() => {
    const fetchUser = async () => {
      if (!ready && !phantomAuthenticated) return;
      if (!authenticated) {
        setCurrentUserId("");
        return;
      }

      const authId = privyUser?.id || phantomUser?.id;
      if (!authId) {
        setCurrentUserId("");
        return;
      }

      try {
        let email: string | undefined;
        if (phantomUser?.email) {
          email = phantomUser.email;
        } else if (privyUser) {
          const privyUserWithEmail = privyUser as {
            email?: { address?: string } | string;
          };
          email =
            (typeof privyUserWithEmail.email === "object" &&
              privyUserWithEmail.email?.address) ||
            (typeof privyUserWithEmail.email === "string" &&
              privyUserWithEmail.email) ||
            undefined;
        }

        const res = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(privyUser?.id
              ? { privyId: privyUser.id }
              : { phantomId: phantomUser!.id }),
            email,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setCurrentUserId(data?.user?.id || "");
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };

    fetchUser();
  }, [
    ready,
    authenticated,
    privyUser?.id,
    phantomUser?.id,
    privyAuthenticated,
    phantomAuthenticated,
  ]);

  // Sync chats from localStorage on mount (only if not already loaded)
  useEffect(() => {
    const storedChats = getChatsFromStorage();
    // Only update if chats have changed (by comparing IDs)
    setChats((prevChats) => {
      const prevIds = prevChats
        .map((c) => c.id)
        .sort()
        .join(",");
      const newIds = storedChats
        .map((c) => c.id)
        .sort()
        .join(",");
      if (prevIds !== newIds) {
        return storedChats;
      }
      return prevChats;
    });
  }, []);

  // Fetch chat details - use localStorage first, only fetch from server if not found
  useEffect(() => {
    const fetchChat = async () => {
      if (!chatId) return;

      let skipServerFetch = false;
      try {
        const raw = sessionStorage.getItem(CLAW_V5_PENDING_STREAM_KEY);
        if (raw) {
          const p = JSON.parse(raw) as { chatId?: string };
          if (p?.chatId === chatId) skipServerFetch = true;
        }
      } catch {
        /* ignore */
      }

      setIsLoading(true);

      // First try localStorage for immediate display (optimistic loading)
      const storedChat = getChatFromStorage(chatId);
      if (storedChat) {
        setCurrentChat(storedChat);
        setMessages(
          (storedChat.messages || []).map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
          })),
        );
        // Don't set loading to false yet - we'll fetch from server to ensure we have latest data
      }

      if (skipServerFetch) {
        skipServerChatFetchUntilSendDoneRef.current = chatId;
        if (!storedChat) {
          setCurrentChat(null);
          setMessages([]);
        }
        setIsLoading(false);
        return;
      }

      if (skipServerChatFetchUntilSendDoneRef.current === chatId) {
        setIsLoading(false);
        return;
      }

      // Always fetch from backend to get the latest messages
      try {
        const res = await fetch(`/api/claw-v5/chats/${chatId}`);
        if (res.ok) {
          const data = await res.json();
          const fetchedChat = data.chat;

          // Save to localStorage with latest data
          saveChatToStorage(fetchedChat);

          // Update state with latest messages from server
          setCurrentChat(fetchedChat);
          setMessages(
            (fetchedChat.messages || []).map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
            })),
          );

          // Don't update chats list when fetching - it causes blinking
          // The chat is already in the list from localStorage
        } else {
          // If chat not found, keep localStorage data if available
          if (!storedChat) {
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error("Error fetching chat:", error);
        // On error, keep localStorage data if available, otherwise show error
        if (!storedChat) {
          setIsLoading(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchChat();
  }, [chatId]);

  const handleSendMessage = useCallback(
    async (
      message: string,
      quotedContent?: string,
      context?: ClawSelectionContext,
      opts?: { userId?: string; onServerContact?: () => void },
    ) => {
      const effectiveUserId = (opts?.userId ?? "").trim() || currentUserId;
      let serverContactNotified = false;
      const notifyServerContact = () => {
        if (serverContactNotified) return;
        serverContactNotified = true;
        opts?.onServerContact?.();
      };

      if (!chatId || !message.trim() || isSending || !authenticated || !effectiveUserId) {
        notifyServerContact();
        return;
      }

      setIsSending(true);
      // Don't assume the phase on the client. The server will emit status events
      // based on intent (market vs crypto vs other).
      setStreamingPhase("");
      setStreamingStatusLabel("");
      setStreamingThinking("");
      thinkingDraftSeparatorPendingRef.current = false;
      if (thinkingDeltaRafRef.current != null) {
        cancelAnimationFrame(thinkingDeltaRafRef.current);
        thinkingDeltaRafRef.current = null;
      }
      thinkingDeltaQueueRef.current = [];

      let tempAiMessageId = "";
      let streamingContent = "";
      let streamBatcher: ReturnType<
        typeof createStreamRafBatcher<string>
      > | null = null;
      try {
        // Build chat history to send to the AI (exclude optimistic/temp UI-only messages)
        const historyForAi = messages
          .filter(
            (m) =>
              (m.role === "user" || m.role === "assistant") &&
              !!m.content?.trim() &&
              !m.id.startsWith("temp-user-") &&
              !m.id.startsWith("temp-ai-"),
          )
          .map((m) => ({ role: m.role, content: m.content }));

        // Construct the message with quoted content if present
        let finalMessage = message;
        if (quotedContent) {
          finalMessage = `"${quotedContent}"\n\n${message}`;
        }

        // Add user message optimistically
        const tempUserMessageId = `temp-user-${Date.now()}`;
        tempAiMessageId = `temp-ai-${Date.now()}`;
        const userMessage: MessageData = {
          id: tempUserMessageId,
          role: "user",
          content: finalMessage,
          uiKey: tempUserMessageId,
        };

        // Add placeholder AI message for streaming
        const aiMessage: MessageData = {
          id: tempAiMessageId,
          role: "assistant",
          content: "",
          uiKey: tempAiMessageId,
        };

        setMessages((prev) => [...prev, userMessage, aiMessage]);
        hadStreamingRef.current = false;
        skipInitialScrollRef.current = false;
        // Scroll once to show the newly sent message (no auto-scroll when AI answers)
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        });

        const controller = new AbortController();
        abortControllerRef.current = controller;

        // Send to API and handle streaming
        const res = await fetch(`/api/claw-v5/chats/${chatId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: finalMessage,
            role: "user",
            history: historyForAi,
            marketMode,
            ...(context?.cryptoChain && { cryptoChain: context.cryptoChain }),
            ...(context?.predictionSubmode != null && { predictionSubmode: context.predictionSubmode }),
            ...(context?.predictionDisplayLevel != null && { predictionDisplayLevel: context.predictionDisplayLevel }),
          }),
          signal: controller.signal,
        });
        notifyServerContact();

        if (res.status === 402) {
          const data = await res.json().catch(() => ({}));
          const code = (data?.code === "PAID_LIMIT_REACHED" ? "PAID_LIMIT_REACHED" : "FREE_LIMIT_REACHED") as PaywallLimitCode;
          setPaywallLimitCode(code);
          setShowPaywall(true);
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                !msg.id.startsWith("temp-user-") && !msg.id.startsWith("temp-ai-"),
            ),
          );
          setStreamingPhase("");
          setStreamingStatusLabel("");
          setStreamingThinking("");
          setIsSending(false);
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to send message");
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let userMessageData: any = null;
        let aiMessageData: any = null;
        let swapOpened = false;

        let reportStreamMd = "";
        /** Rex / ```topmarkets``` / etc. streamed before ```cryptotech``` */
        let preCryptotechMarkdown = "";
        let cryptotechBlock = "";
        let cryptotechFenceComplete = false;
        let synthTail = "";
        let sawCryptotech = false;
        /** After synthStart, clear Live notes on the first answer chunk (avoids a blank flash). */
        let deferClearLiveNotesUntilChunk = false;

        const recomputeStreamingText = () =>
          recomputeClawStreamingAssistantText({
            reportStreamMd,
            preCryptotechMarkdown,
            sawCryptotech,
            cryptotechBlock,
            synthTail,
          });

        const sb = createStreamRafBatcher<string>((content) => {
          streamingContent = content;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAiMessageId || msg.uiKey === tempAiMessageId
                ? { ...msg, content }
                : msg,
            ),
          );
        });
        streamBatcher = sb;

        const updateStreamingContent = (content: string, force = false) => {
          streamingContent = content;
          if (force) sb.flushNow(content);
          else sb.schedule(content);
        };

        const flushThinkingDeltaQueue = () => {
          thinkingDeltaRafRef.current = null;
          const batch = thinkingDeltaQueueRef.current;
          thinkingDeltaQueueRef.current = [];
          if (batch.length === 0) return;
          setStreamingThinking((prev) => {
            let next = prev;
            for (const { phase, text } of batch) {
              if (phase === "draft") {
                if (!thinkingDraftSeparatorPendingRef.current) {
                  thinkingDraftSeparatorPendingRef.current = true;
                  next = next + (next.trim() ? "\n\n---\n\n" : "");
                }
              }
              next = next + text;
            }
            return next;
          });
        };

        const scheduleThinkingDelta = (phase: string, text: string) => {
          thinkingDeltaQueueRef.current.push({ phase, text });
          if (thinkingDeltaRafRef.current != null) return;
          thinkingDeltaRafRef.current = requestAnimationFrame(
            flushThinkingDeltaQueue,
          );
        };

        const ndjson = createNdjsonAccumulator(
          (parsed: Record<string, unknown>) => {
            if (parsed.type === "userMessage") {
              userMessageData = parsed.data;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempUserMessageId
                    ? {
                        ...msg,
                        id: (userMessageData as { id: string }).id,
                        role: "user",
                        content: (userMessageData as { content: string })
                          .content,
                        createdAt: (userMessageData as { createdAt?: string })
                          .createdAt,
                      }
                    : msg,
                ),
              );
            } else if (parsed.type === "reportDelta") {
              const text = String(parsed.text ?? "");
              reportStreamMd += text;
              updateStreamingContent(recomputeStreamingText());
            } else if (parsed.type === "thinkingDelta") {
              const phase = String(parsed.phase ?? "");
              const t = String(parsed.text ?? "");
              scheduleThinkingDelta(phase, t);
            } else if (parsed.type === "synthStart") {
              if (thinkingDeltaRafRef.current != null) {
                cancelAnimationFrame(thinkingDeltaRafRef.current);
                thinkingDeltaRafRef.current = null;
              }
              const tail = thinkingDeltaQueueRef.current;
              thinkingDeltaQueueRef.current = [];
              // Ensure queued deltas commit before we clear "Live notes" (avoid dropping the tail vs RAF).
              if (tail.length > 0) {
                flushSync(() => {
                  setStreamingThinking((prev) => {
                    let next = prev;
                    for (const { phase, text } of tail) {
                      if (phase === "draft") {
                        if (!thinkingDraftSeparatorPendingRef.current) {
                          thinkingDraftSeparatorPendingRef.current = true;
                          next = next + (next.trim() ? "\n\n---\n\n" : "");
                        }
                      }
                      next = next + text;
                    }
                    return next;
                  });
                });
              }
              thinkingDraftSeparatorPendingRef.current = false;
              deferClearLiveNotesUntilChunk = true;
            } else if (parsed.type === "chunk") {
              if (deferClearLiveNotesUntilChunk) {
                deferClearLiveNotesUntilChunk = false;
                setStreamingThinking("");
              }
              const c = String(parsed.content ?? "");
              if (!sawCryptotech && c.includes("```cryptotech")) {
                sawCryptotech = true;
                preCryptotechMarkdown = synthTail;
                synthTail = "";
                cryptotechBlock = c;
                cryptotechFenceComplete =
                  cryptotechFenceClosedAndParses(cryptotechBlock);
              } else if (sawCryptotech && !cryptotechFenceComplete) {
                cryptotechBlock += c;
                cryptotechFenceComplete =
                  cryptotechFenceClosedAndParses(cryptotechBlock);
              } else {
                synthTail += c;
              }
              updateStreamingContent(recomputeStreamingText());
            } else if (parsed.type === "status") {
              const phase = parsed.phase as
                | "markets"
                | "report"
                | "research"
                | "draft"
                | "synth"
                | undefined;
              if (phase) setStreamingPhase(phase);
              if (typeof parsed.label === "string") {
                setStreamingStatusLabel(parsed.label);
              }
            } else if (parsed.type === "aiMessage") {
              aiMessageData = parsed.data;
              const finalContent = (aiMessageData as { content: string })
                .content;
              streamingContent = finalContent;
              sb.cancel();
              setStreamingPhase("");
              setStreamingStatusLabel("");

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === tempAiMessageId
                    ? {
                        ...msg,
                        id: (aiMessageData as { id: string }).id,
                        role: "assistant",
                        content: finalContent,
                        createdAt: (aiMessageData as { createdAt?: string })
                          .createdAt,
                      }
                    : msg,
                ),
              );

              let didOpenFromCrypto = false;
              const cryptotechMatch = finalContent?.match(
                /```cryptotech\s*([\s\S]*?)```/i,
              );
              if (cryptotechMatch?.[1]) {
                try {
                  const payload = JSON.parse(cryptotechMatch[1]);
                  const hasToken =
                    payload?.token &&
                    (payload.token.tokenAddress ||
                      payload.token.contractAddress);
                  if (
                    (payload?.kind === "indicator" && payload?.analysis) ||
                    (payload?.kind === "technical_report" && hasToken)
                  ) {
                    setActiveCryptoPayload(payload);
                    setIsSwapOpen(true);
                    swapOpened = true;
                    didOpenFromCrypto = true;
                  }
                } catch {
                  /* ignore */
                }
              }
              if (!didOpenFromCrypto) {
                const contract = extractContractFromText(finalMessage);
                if (contract) {
                  setActiveCryptoPayload({
                    token: {
                      tokenAddress: contract.address,
                      contractAddress: contract.address,
                      chainId: contract.chainId,
                    },
                  });
                  setIsSwapOpen(true);
                  swapOpened = true;
                }
              }
            } else if (parsed.type === "error") {
              throw new Error(String(parsed.error || "Streaming failed"));
            }
          },
        );

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            ndjson.push(decoder.decode(value, { stream: true }));
          }
          ndjson.flush();

          // Drain batched thinking deltas (stream may end without another RAF tick).
          if (
            thinkingDeltaRafRef.current != null ||
            thinkingDeltaQueueRef.current.length > 0
          ) {
            if (thinkingDeltaRafRef.current != null) {
              cancelAnimationFrame(thinkingDeltaRafRef.current);
              thinkingDeltaRafRef.current = null;
            }
            flushThinkingDeltaQueue();
          }

          // Ensure final update is applied if streaming content exists
          if (streamingContent && !aiMessageData) {
            updateStreamingContent(recomputeStreamingText(), true);
          }

          // Fallback: open swap after stream ends if we never opened (e.g. aiMessage was split across chunks)
          if (!swapOpened) {
            const contentToParse = aiMessageData?.content ?? streamingContent;
            const cryptotechMatch = contentToParse?.match(
              /```cryptotech\s*([\s\S]*?)```/i
            );
            if (cryptotechMatch?.[1]) {
              try {
                const payload = JSON.parse(cryptotechMatch[1]);
                const hasToken =
                  payload?.token &&
                  (payload.token.tokenAddress ||
                    payload.token.contractAddress);
                if (
                  (payload?.kind === "indicator" && payload?.analysis) ||
                  (payload?.kind === "technical_report" && hasToken)
                ) {
                  setActiveCryptoPayload(payload);
                  setIsSwapOpen(true);
                  swapOpened = true;
                }
              } catch {
                // ignore
              }
            }
            if (!swapOpened && finalMessage) {
              const contract = extractContractFromText(finalMessage);
              if (contract) {
                setActiveCryptoPayload({
                  token: {
                    tokenAddress: contract.address,
                    contractAddress: contract.address,
                    chainId: contract.chainId,
                  },
                });
                setIsSwapOpen(true);
              }
            }
          }
        }

        // Update localStorage with final messages
        if (currentChat && userMessageData && aiMessageData) {
          const updatedChat: Chat = {
            ...currentChat,
            messages: [
              ...currentChat.messages,
              {
                id: userMessageData.id,
                role: "user",
                content: userMessageData.content,
                createdAt: userMessageData.createdAt,
              },
              {
                id: aiMessageData.id,
                role: "assistant",
                content: aiMessageData.content,
                createdAt: aiMessageData.createdAt,
              },
            ],
            updatedAt: new Date().toISOString(),
          };
          saveChatToStorage(updatedChat);
          setCurrentChat(updatedChat);

          // Update chats list in sidebar
          setChats((prevChats) => {
            const updatedChats = prevChats.map((c) =>
              c.id === updatedChat.id ? updatedChat : c,
            );
            return updatedChats;
          });
        }
      } catch (error) {
        notifyServerContact();
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (isAbort) {
          setStreamingPhase("");
          setStreamingStatusLabel("");
          setStreamingThinking("");
          const hasContent = (streamingContent || "").trim().length > 0;
          setMessages((prev) => {
            if (!hasContent) {
              // No content generated: remove the empty assistant message (like ChatGPT)
              return prev.filter(
                (m) =>
                  m.id !== tempAiMessageId &&
                  m.uiKey !== tempAiMessageId,
              );
            }
            // Partial content: keep the assistant message with content generated so far
            const next = [...prev];
            const idx = next.findIndex(
              (m) =>
                m.id === tempAiMessageId || m.uiKey === tempAiMessageId,
            );
            if (idx !== -1) {
              next[idx] = { ...next[idx], content: streamingContent };
            }
            return next;
          });
        } else {
          console.error("Error sending message:", error);
          setStreamingPhase("");
          setStreamingStatusLabel("");
          setStreamingThinking("");
          setMessages((prev) =>
            prev.filter(
              (msg) =>
                !msg.id.startsWith("temp-user-") &&
                !msg.id.startsWith("temp-ai-"),
            ),
          );
          showErrorNotification("Error", "Failed to send message.");
        }
      } finally {
        streamBatcher?.cancel();
        if (thinkingDeltaRafRef.current != null) {
          cancelAnimationFrame(thinkingDeltaRafRef.current);
          thinkingDeltaRafRef.current = null;
        }
        thinkingDeltaQueueRef.current = [];
        abortControllerRef.current = null;
        skipServerChatFetchUntilSendDoneRef.current = null;
        setIsSending(false);
        setStreamingPhase("");
        setStreamingStatusLabel("");
        setStreamingThinking("");
        setQuotedContent(undefined);
      }
    },
    [chatId, isSending, messages, currentChat, marketMode, extractContractFromText, authenticated, currentUserId],
  );

  handleSendMessageRef.current = handleSendMessage;

  useEffect(() => {
    pendingInitialStreamStartedRef.current = false;
  }, [chatId]);

  useEffect(() => {
    if (pendingInitialStreamStartedRef.current) return;
    if (!chatId || !currentUserId.trim() || !authenticated || isLoading) return;

    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(CLAW_V5_PENDING_STREAM_KEY);
    } catch {
      return;
    }
    if (!raw) return;

    type Pending = {
      chatId: string;
      message: string;
      quotedContent?: string;
      marketMode?: PredictionMarketMode;
      context?: ClawSelectionContext;
    };
    let pending: Pending;
    try {
      pending = JSON.parse(raw) as Pending;
    } catch {
      return;
    }
    if (pending.chatId !== chatId) return;

    sessionStorage.removeItem(CLAW_V5_PENDING_STREAM_KEY);
    setSessionPendingForChat(false);
    pendingInitialStreamStartedRef.current = true;
    if (pending.marketMode) setMarketMode(pending.marketMode);

    queueMicrotask(() => {
      void handleSendMessageRef.current?.(
        pending.message,
        pending.quotedContent,
        pending.context,
      );
    });
  }, [chatId, currentUserId, authenticated, isLoading]);

  const handleQuote = useCallback((content: string) => {
    setQuotedContent(content);
  }, []);

  const handleDeepAnalysisMarket = useCallback(
    async (params: {
      provider: "polymarket" | "kalshi" | "limitless" | "myriad" | "predictfun";
      marketId: string;
      title: string;
    }) => {
      if (!authenticated) {
        showErrorNotification(
          "Sign in required",
          "Sign in to run deep analysis from the chat.",
        );
        return;
      }
      if (isSending) {
        showErrorNotification(
          "Please wait",
          "Let the current reply finish before starting deep analysis.",
        );
        return;
      }

      let effectiveUserId = currentUserId.trim();
      if (!effectiveUserId) {
        const authId = privyUser?.id || phantomUser?.id;
        if (!authId) {
          showErrorNotification(
            "Please wait",
            "Your session is still loading. Try again in a moment.",
          );
          return;
        }
        try {
          let email: string | undefined;
          if (phantomUser?.email) {
            email = phantomUser.email;
          } else if (privyUser) {
            const privyUserWithEmail = privyUser as {
              email?: { address?: string } | string;
            };
            email =
              (typeof privyUserWithEmail.email === "object" &&
                privyUserWithEmail.email?.address) ||
              (typeof privyUserWithEmail.email === "string" &&
                privyUserWithEmail.email) ||
              undefined;
          }
          const res = await fetch("/api/user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(privyUser?.id
                ? { privyId: privyUser.id }
                : { phantomId: phantomUser!.id }),
              email,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            effectiveUserId = (data?.user?.id || "").trim();
            if (effectiveUserId) setCurrentUserId(effectiveUserId);
          }
        } catch (e) {
          console.error("Deep analysis: failed to resolve user", e);
        }
      }

      if (!effectiveUserId) {
        showErrorNotification(
          "Please wait",
          "Could not resolve your account. Try again in a moment.",
        );
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const rexPath =
        params.provider === "predictfun"
          ? "predict-fun"
          : params.provider;
      const url = `${origin}/rexmarkets/${rexPath}/${encodeURIComponent(params.marketId)}`;
      const providerLabel =
        params.provider === "kalshi"
          ? "Kalshi"
          : params.provider === "limitless"
            ? "Limitless"
            : params.provider === "myriad"
              ? "Myriad"
              : params.provider === "predictfun"
                ? "Predict.fun"
                : "Polymarket";
      await new Promise<void>((resolve) => {
        void handleSendMessage(
          `Give me a deep analysis of this prediction market about ${params.title} on ${providerLabel}: ${url}`,
          undefined,
          undefined,
          {
            userId: effectiveUserId,
            onServerContact: () => resolve(),
          },
        );
      });
    },
    [
      authenticated,
      currentUserId,
      handleSendMessage,
      isSending,
      privyUser,
      phantomUser,
    ],
  );

  const handleClearQuote = useCallback(() => {
    setQuotedContent(undefined);
  }, []);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleShare = useCallback(() => {
    const shareUrl = `${window.location.origin}/claw-v5/${chatId}`;
    copy(shareUrl);
    showSuccessNotification("Link Copied", "Share link copied to clipboard!");
  }, [chatId]);

  const handleExchange = useCallback(() => {
    setActiveCryptoPayload(
      (prev: any) => prev ?? findLatestCryptoPayload(messages),
    );
    setIsSwapOpen(true);
  }, [findLatestCryptoPayload, messages]);

  // Ensure swap panel is hidden when entering/switching chats (sidebar-style behavior).
  useEffect(() => {
    setIsSwapOpen(false);
    setActiveCryptoPayload(null);
    initialMessageIdsRef.current = new Set();
    initialMessagesCapturedRef.current = false;
    openedSwapForMessageIdsRef.current = new Set();
  }, [chatId]);

  // Capture the initial message IDs once the first load is complete.
  useEffect(() => {
    if (initialMessagesCapturedRef.current) return;
    if (isLoading) return;
    initialMessageIdsRef.current = new Set(messages.map((m) => m.id));
    initialMessagesCapturedRef.current = true;
  }, [isLoading, messages]);

  // Auto-open swap for latest assistant message: cryptotech embed (indicator or technical_report) or contract in last user message.
  // Runs on load (e.g. when redirected from main page after first query) and when new messages arrive.
  useEffect(() => {
    if (!initialMessagesCapturedRef.current) return;

    const newestAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && !!m.id && !!m.content);
    if (!newestAssistant) return;

    if (openedSwapForMessageIdsRef.current.has(newestAssistant.id)) return;

    const match = newestAssistant.content.match(
      /```cryptotech\s*([\s\S]*?)```/i,
    );
    if (match?.[1]) {
      try {
        const payload = JSON.parse(match[1]);
        const hasToken = payload?.token && (payload.token.tokenAddress || payload.token.contractAddress);
        if (
          (payload?.kind === "indicator" && payload?.analysis) ||
          (payload?.kind === "technical_report" && hasToken)
        ) {
          openedSwapForMessageIdsRef.current.add(newestAssistant.id);
          setActiveCryptoPayload(payload);
          setIsSwapOpen(true);
          return;
        }
      } catch {
        // fall through to contract fallback
      }
    }

    // No cryptotech block: if last user message contains a contract address, open swap with it
    const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content);
    if (lastUser?.content) {
      const contract = extractContractFromText(lastUser.content);
      if (contract) {
        openedSwapForMessageIdsRef.current.add(newestAssistant.id);
        setActiveCryptoPayload({
          token: {
            tokenAddress: contract.address,
            contractAddress: contract.address,
            chainId: contract.chainId,
          },
        });
        setIsSwapOpen(true);
      }
    }
  }, [messages, extractContractFromText]);

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      // Update locally first
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: newContent } : msg,
        ),
      );

      // TODO: Implement API call to update message
      // For now, just update localStorage
      if (currentChat) {
        const updatedChat = {
          ...currentChat,
          messages: currentChat.messages.map((msg) =>
            msg.id === messageId ? { ...msg, content: newContent } : msg,
          ),
        };
        saveChatToStorage(updatedChat);
      }
    },
    [currentChat],
  );

  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleNewChat = useCallback(() => {
    // On chat detail page, redirect to main claw-v5 page
    router.push("/claw-v5");
  }, [router]);

  const handleChatRename = useCallback(
    async (chatId: string, newTitle: string) => {
      try {
        const res = await fetch(`/api/claw-v5/chats/${chatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });

        if (res.ok) {
          const data = await res.json();
          const updatedChat = data.chat;
          const message = data.message || "Title Updated";

          // Update localStorage
          saveChatToStorage(updatedChat);

          // Update current chat if it's the one being renamed
          if (currentChat && currentChat.id === chatId) {
            setCurrentChat(updatedChat);
          }

          // Update chats list in sidebar (only update the specific chat)
          setChats((prevChats) => {
            // Find the index of the chat to update
            const chatIndex = prevChats.findIndex((c) => c.id === chatId);
            if (chatIndex === -1) return prevChats;

            // Preserve existing messages when updating title
            const existingChat = prevChats[chatIndex];
            const updatedChatWithMessages = {
              ...updatedChat,
              messages: existingChat.messages || updatedChat.messages || [],
            };

            // Create a completely new array with the updated chat
            const updatedChats = prevChats.map((c, index) =>
              index === chatIndex ? updatedChatWithMessages : c,
            );

            // Return new array to force re-render
            return updatedChats;
          });

          // Show success notification
          const { showSuccessNotification } =
            await import("@/components/ui/notification");
          showSuccessNotification(message);
        } else {
          throw new Error("Failed to rename chat");
        }
      } catch (error) {
        console.error("Error renaming chat:", error);
        const { showErrorNotification } =
          await import("@/components/ui/notification");
        showErrorNotification("Error", "Failed to rename chat");
        throw error;
      }
    },
    [currentChat],
  );

  const handleChatDelete = useCallback(
    async (deletedChatId: string) => {
      try {
        const res = await fetch(`/api/claw-v5/chats/${deletedChatId}`, {
          method: "DELETE",
        });

        if (res.ok) {
          // Remove from localStorage
          deleteChatFromStorage(deletedChatId);

          // Update chats list in sidebar (remove the deleted chat)
          setChats((prevChats) =>
            prevChats.filter((c) => c.id !== deletedChatId),
          );

          // Show success notification
          showSuccessNotification(
            "Chat Deleted",
            "The chat has been successfully removed.",
          );

          // If deleting the current chat (check if deleted chat ID matches current page chat ID), redirect to main page
          if (deletedChatId === chatId) {
            // Small delay to allow notification to show before redirect
            setTimeout(() => {
              router.push("/claw-v5");
            }, 500);
          }
        } else {
          throw new Error("Failed to delete chat");
        }
      } catch (error) {
        console.error("Error deleting chat:", error);
        showErrorNotification("Error", "Failed to delete chat");
        throw error; // Re-throw to let modal handle it
      }
    },
    [chatId, router],
  );

  const threadHasCryptoExchangeContext = useMemo(() => {
    if (findLatestCryptoPayload(messages)) return true;
    if (
      messages.some(
        (m) =>
          m.role === "assistant" &&
          typeof m.content === "string" &&
          /```cryptotech/i.test(m.content),
      )
    )
      return true;
    if (
      messages.some(
        (m) =>
          m.role === "user" &&
          extractContractFromText(m.content || "") != null,
      )
    )
      return true;
    return false;
  }, [messages, findLatestCryptoPayload, extractContractFromText]);

  const showClawExchangeButton =
    marketMode === "Crypto" || threadHasCryptoExchangeContext;

  if (isLoading) {
    return (
      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 w-full flex-col">
            <RexHeader
              onHistoryClick={() => {}}
              showExchangeButton={false}
              clawV5MainNavShiftPx={clawV5HeaderNavShiftPx(
                isChatSidebarCollapsed,
              )}
            />
            <div className="flex-1 flex overflow-hidden bg-black border-y-2 border-[#FFC000] min-h-0">
              <ChatSidebar
                chats={chats}
                isLoading={false}
                onNewChat={handleNewChat}
                collapsed={isChatSidebarCollapsed}
                onCollapsedChange={setIsChatSidebarCollapsed}
              />
              <div className="flex-1 flex items-center justify-center text-white">
                Loading chat...
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 w-full flex-col">
          {/* Header */}
          <RexHeader
            onHistoryClick={() => {}}
            showExchangeButton={false}
            clawV5MainNavShiftPx={clawV5HeaderNavShiftPx(
              isChatSidebarCollapsed,
            )}
          />

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden bg-black border-y-2 border-[#FFC000] relative min-h-0">
            <ChatSidebar
              chats={chats}
              isLoading={false}
              onNewChat={handleNewChat}
              onChatRename={handleChatRename}
              onChatDelete={handleChatDelete}
              isMobileOpen={isSidebarOpen}
              onMobileClose={() => setIsSidebarOpen(false)}
              collapsed={isChatSidebarCollapsed}
              onCollapsedChange={setIsChatSidebarCollapsed}
            />

            <div className="flex-1 flex min-h-0 min-w-0 bg-black">
              <div className="flex-1 flex flex-col bg-black min-h-0 min-w-0">
                {/* Chat Header */}
                <div className="flex-shrink-0 p-3 md:p-4 flex items-center justify-between md:justify-end gap-2">
                  {/* Mobile: Menu and Share buttons in one line */}
                  <div className="md:hidden flex items-center justify-between gap-2 w-full">
                    <button
                      onClick={() => setIsSidebarOpen(true)}
                      className="p-2 rounded-lg text-white/80 hover:text-white transition-colors"
                      aria-label="Open sidebar"
                    >
                      <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-3">
                      {showClawExchangeButton && (
                        <button
                          onClick={handleExchange}
                          className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors"
                          aria-label="Open exchange"
                          title="Exchange"
                        >
                          <Image
                            src="/images/exchange.png"
                            alt="Exchange"
                            width={72}
                            height={32}
                            className="w-25 h-10"
                          />
                        </button>
                      )}
                      <button
                        onClick={handleShare}
                        className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors"
                        aria-label="Share"
                        title="Share"
                      >
                        <Share2 className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                  {/* Desktop: Exchange (crypto mode only) + Share */}
                  <div className="hidden md:flex items-center gap-3">
                    {showClawExchangeButton && (
                      <button
                        onClick={handleExchange}
                        className="cursor-pointer transition hover:scale-[1.03]"
                        aria-label="Open exchange"
                        title="Exchange"
                      >
                        <Image
                          src="/images/exchange.png"
                          alt="Enter The Exchange."
                          width={120}
                          height={48}
                          className="w-25 h-10 object-contain"
                        />
                      </button>
                    )}
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm"
                      aria-label="Share"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 min-w-0 custom-chat-messages-scrollbar px-1.5 sm:px-2 md:px-0">
                  <div className="mx-auto w-full max-w-4xl">
                    {messages.length === 0 ? (
                      isLoading ||
                      isSending ||
                      sessionPendingForChat ? (
                        <div
                          className="flex flex-col items-center justify-center min-h-[min(50vh,28rem)] gap-3 px-4 py-12"
                          role="status"
                          aria-live="polite"
                          aria-busy="true"
                        >
                          <Loader2
                            className="w-10 h-10 text-[#FFC000] animate-spin"
                            aria-hidden
                          />
                          <p className="text-sm text-white/65 text-center max-w-sm">
                            {isSending || sessionPendingForChat
                              ? "Preparing your conversation…"
                              : "Loading chat…"}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full min-h-[min(40vh,20rem)] text-gray-400 text-sm px-4">
                          No messages yet. Start a conversation!
                        </div>
                      )
                    ) : (
                      <div className="pb-4">
                        {messages.map((message, index) => (
                          <Message
                            key={message.uiKey ?? message.id}
                            message={message}
                            onEdit={handleEditMessage}
                            onCopy={handleCopyMessage}
                            onQuote={handleQuote}
                            onDeepAnalysisMarket={handleDeepAnalysisMarket}
                            isStreaming={
                              message.role === "assistant" &&
                              isSending &&
                              index === messages.length - 1 &&
                              (message.content === "" ||
                                message.id.startsWith("temp-ai-") ||
                                !message.createdAt)
                            }
                            streamingPhase={
                              message.role === "assistant" &&
                              isSending &&
                              index === messages.length - 1
                                ? streamingPhase
                                : ""
                            }
                            streamingStatusLabel={
                              message.role === "assistant" &&
                              isSending &&
                              index === messages.length - 1
                                ? streamingStatusLabel
                                : ""
                            }
                            streamingThinking={
                              message.role === "assistant" &&
                              isSending &&
                              index === messages.length - 1
                                ? streamingThinking
                                : ""
                            }
                          />
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat Input */}
                <div className="flex-shrink-0">
                  <ChatInput
                    onSendMessage={handleSendMessage}
                    isLoading={isSending}
                    onStop={handleStop}
                    placeholder="Search Prediction Events, Arbitrage, Wallets, Cryptocurrencies and more!"
                    quotedContent={quotedContent}
                    onClearQuote={handleClearQuote}
                    marketMode={marketMode}
                    onMarketModeChange={setMarketMode}
                    disabled={!authenticated}
                    disabledPlaceholder="Sign in to chat"
                  />
                </div>
              </div>

              <CryptoSwapPanel
                isOpen={isSwapOpen}
                onClose={() => setIsSwapOpen(false)}
                currentUserId={currentUserId}
                payload={activeCryptoPayload}
              />
            </div>
          </div>

          <Footer />
        </div>
      </div>
    </div>
    <PaywallModal
      open={showPaywall}
      onClose={() => {
        setShowPaywall(false);
        setPaywallLimitCode(null);
      }}
      context="claw"
      limitCode={paywallLimitCode}
      paymentMetadata={currentUserId ? { userId: currentUserId } : undefined}
    />
    </>
  );
}
