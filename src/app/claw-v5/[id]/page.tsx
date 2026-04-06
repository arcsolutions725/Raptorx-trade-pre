"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import { Share2, Menu } from "lucide-react";
import Image from "next/image";
import copy from "copy-to-clipboard";
import ChatSidebar from "../_components/chat/ChatSidebar";
import ChatInput, {
  type PredictionMarketMode,
  type ClawSelectionContext,
} from "../_components/chat/ChatInput";
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
import { PaywallModal, type PaywallLimitCode } from "@/components/subscription/PaywallModal";

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
    "" | "markets" | "research" | "draft" | "synth"
  >("");
  const [streamingStatusLabel, setStreamingStatusLabel] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [quotedContent, setQuotedContent] = useState<string | undefined>(
    undefined,
  );
  const [marketMode, setMarketMode] = useState<PredictionMarketMode>("Markets");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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

  // Extract Solana (base58, 32–44 chars) or BNB (0x + 40 hex) contract from text
  const extractContractFromText = useCallback((text: string): { address: string; chainId: string } | null => {
    const t = (text || "").trim();
    if (!t) return null;
    const bnbWord = /^0x[a-fA-F0-9]{40}$/;
    const solanaWord = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    const bnbAny = /0x[a-fA-F0-9]{40}/g;
    const solanaAny = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
    const words = t.split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[.,;:!?)]+$/, "").trim();
      if (bnbWord.test(clean)) return { address: clean, chainId: "bsc" };
      if (solanaWord.test(clean)) return { address: clean, chainId: "solana" };
    }
    const bnbMatch = t.match(bnbAny);
    if (bnbMatch?.[0]) return { address: bnbMatch[0], chainId: "bsc" };
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
    async (message: string, quotedContent?: string, context?: ClawSelectionContext) => {
      if (!chatId || !message.trim() || isSending || !authenticated || !currentUserId) return;

      setIsSending(true);
      // Don't assume the phase on the client. The server will emit status events
      // based on intent (market vs crypto vs other).
      setStreamingPhase("");
      setStreamingStatusLabel("");

      let tempAiMessageId = "";
      let streamingContent = "";
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
        };

        // Add placeholder AI message for streaming
        const aiMessage: MessageData = {
          id: tempAiMessageId,
          role: "assistant",
          content: "",
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
        let lastUpdateTime = 0;
        let swapOpened = false;
        const UPDATE_INTERVAL = 16; // ~60fps for smooth updates

        // Smooth streaming update function
        const updateStreamingContent = (content: string, force = false) => {
          const now = Date.now();
          if (force || now - lastUpdateTime >= UPDATE_INTERVAL) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === tempAiMessageId ? { ...msg, content } : msg,
              ),
            );
            lastUpdateTime = now;
            return true;
          }
          return false;
        };

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);

                if (parsed.type === "userMessage") {
                  userMessageData = parsed.data;
                  // Update user message with actual data
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === tempUserMessageId
                        ? {
                            id: userMessageData.id,
                            role: "user",
                            content: userMessageData.content,
                            createdAt: userMessageData.createdAt,
                          }
                        : msg,
                    ),
                  );
                } else if (parsed.type === "chunk") {
                  // Stream content chunk - accumulate and update smoothly
                  streamingContent += parsed.content;
                  updateStreamingContent(streamingContent);
                } else if (parsed.type === "status") {
                  const phase = parsed.phase as
                    | "research"
                    | "draft"
                    | "synth"
                    | undefined;
                  if (phase) setStreamingPhase(phase);
                  if (typeof parsed.label === "string") {
                    setStreamingStatusLabel(parsed.label);
                  }
                } else if (parsed.type === "aiMessage") {
                  // Final AI message with complete data - force update
                  aiMessageData = parsed.data;
                  updateStreamingContent(aiMessageData.content, true);
                  setStreamingPhase("");
                  setStreamingStatusLabel("");

                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === tempAiMessageId
                        ? {
                            id: aiMessageData.id,
                            role: "assistant",
                            content: aiMessageData.content,
                            createdAt: aiMessageData.createdAt,
                          }
                        : msg,
                    ),
                  );

                  // Auto-open swap with token when response is ready
                  let didOpenFromCrypto = false;
                  const cryptotechMatch = aiMessageData.content?.match(
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
                        didOpenFromCrypto = true;
                      }
                    } catch {
                      // ignore
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
                  throw new Error(parsed.error || "Streaming failed");
                }
              } catch (e) {
                // Skip invalid JSON lines
                console.error("Error parsing stream chunk:", e);
              }
            }
          }

          // Ensure final update is applied if streaming content exists
          if (streamingContent && !aiMessageData) {
            updateStreamingContent(streamingContent, true);
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
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (isAbort) {
          setStreamingPhase("");
          setStreamingStatusLabel("");
          const hasContent = (streamingContent || "").trim().length > 0;
          setMessages((prev) => {
            if (!hasContent) {
              // No content generated: remove the empty assistant message (like ChatGPT)
              return prev.filter((m) => m.id !== tempAiMessageId);
            }
            // Partial content: keep the assistant message with content generated so far
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === tempAiMessageId);
            if (idx !== -1) {
              next[idx] = { ...next[idx], content: streamingContent };
            }
            return next;
          });
        } else {
          console.error("Error sending message:", error);
          setStreamingPhase("");
          setStreamingStatusLabel("");
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
        abortControllerRef.current = null;
        setIsSending(false);
        setStreamingPhase("");
        setStreamingStatusLabel("");
        setQuotedContent(undefined);
      }
    },
    [chatId, isSending, messages, currentChat, marketMode, extractContractFromText, authenticated, currentUserId],
  );

  const handleQuote = useCallback((content: string) => {
    setQuotedContent(content);
  }, []);

  const handleDeepAnalysisMarket = useCallback(
    (params: { provider: "polymarket" | "kalshi"; marketId: string; title: string }) => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/rexmarkets/${params.provider}/${encodeURIComponent(params.marketId)}`;
      const providerLabel = params.provider === "kalshi" ? "Kalshi" : "Polymarket";
      handleSendMessage(
        `Give me a deep analysis of this prediction market about ${params.title} on ${providerLabel}: ${url}`,
      );
    },
    [handleSendMessage],
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

  if (isLoading) {
    return (
      <div className="relative w-full h-screen flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <div className="h-full flex flex-col w-full">
            <RexHeader onHistoryClick={() => {}} showExchangeButton={false} />
            <div className="flex-1 flex overflow-hidden bg-black border-y-2 border-[#FFC000] pb-21.75 sm:pb-13.75">
              <ChatSidebar
                chats={chats}
                isLoading={false}
                onNewChat={handleNewChat}
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
    <div className="relative w-full h-screen flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <div className="h-full flex flex-col w-full">
          {/* Header */}
          <RexHeader onHistoryClick={() => {}} showExchangeButton={false} />

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden bg-black border-y-2 border-[#FFC000] pb-21.75 sm:pb-13.75 relative">
            <ChatSidebar
              chats={chats}
              isLoading={false}
              onNewChat={handleNewChat}
              onChatRename={handleChatRename}
              onChatDelete={handleChatDelete}
              isMobileOpen={isSidebarOpen}
              onMobileClose={() => setIsSidebarOpen(false)}
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
                  {/* Desktop: Exchange + Share */}
                  <div className="hidden md:flex items-center gap-3">
                    <button
                      onClick={handleExchange}
                      className="cursor-pointer transition hover:scale-[1.03]"
                      aria-label="Open exchange"
                      title="Exchange"
                    >
                      <Image
                        src="/images/exchange.png"
                        alt="Enter the exchange"
                        width={120}
                        height={48}
                        className="w-25 h-10 object-contain"
                      />
                    </button>
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
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-chat-messages-scrollbar px-2 md:px-0">
                  <div className="mx-auto w-full max-w-4xl">
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm px-4">
                        No messages yet. Start a conversation!
                      </div>
                    ) : (
                      <div className="pb-4">
                        {messages.map((message, index) => (
                          <Message
                            key={message.id}
                            message={message}
                            onEdit={handleEditMessage}
                            onCopy={handleCopyMessage}
                            onQuote={handleQuote}
                            onDeepAnalysisMarket={handleDeepAnalysisMarket}
                            disableDeepAnalysis={isSending}
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
