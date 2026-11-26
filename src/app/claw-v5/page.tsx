"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import Image from "next/image";
import ChatSidebar from "./_components/chat/ChatSidebar";
import ClawAura from "./_components/chat/ClawAura";
import ChatInput, {
  type PredictionMarketMode,
  type ClawSelectionContext,
} from "./_components/chat/ChatInput";
import { CLAW_V5_PENDING_STREAM_KEY } from "@/lib/clawV5/streamingReportDisplay";
import { consumeClawV5Prefill, consumeClawV5ScrollToInput } from "@/lib/clawV5/scrollIntent";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import {
  getChatsFromStorage,
  saveChatsToStorage,
  saveChatToStorage,
  Chat,
} from "@/lib/storage/chatStorage";
import { ArrowRight, Clock, PanelLeft, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { PaywallModal, type PaywallLimitCode } from "@/components/ui/modal/PaywallModal";

import {
  showSuccessNotification,
  showErrorNotification,
} from "@/components/ui/notification";

export default function ClawV5Page() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatSidebarCollapsed, setIsChatSidebarCollapsed] = useState(false);
  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    ready,
  } = usePrivy();
  const { isAuthenticated: phantomAuthenticated, user: phantomUser } =
    usePhantomConnect();
  const authenticated = privyAuthenticated || phantomAuthenticated;

  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [hasFetched, setHasFetched] = useState(false);
  const [prefillText, setPrefillText] = useState<string>("");
  // "Ask Claw about SYM" (Full Report / What's New actions) leaves a question for the composer
  useEffect(() => {
    const q = consumeClawV5Prefill();
    if (q) setPrefillText(q);
  }, []);
  const [marketMode, setMarketMode] = useState<PredictionMarketMode>("Markets");
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLimitCode, setPaywallLimitCode] = useState<PaywallLimitCode | null>(null);
  const welcomeScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollIntentRef = useRef<{ read: boolean; toInput: boolean }>({
    read: false,
    toInput: false,
  });

  // Where the mobile welcome screen lands on arrival:
  //   - via the header's "Claw AI 5.0" button → bottom (prompt cards + input)
  //   - refresh / direct visit               → top (logo + title)
  // (Not gated on `isLoading` — that only tracks the sidebar's chat fetch and
  // never resolves when signed out, but the welcome content renders regardless.)
  useEffect(() => {
    if (isSending) return;
    if (typeof window === "undefined") return;

    const el = welcomeScrollRef.current;
    if (!el) return;

    // Consume once per mount — StrictMode re-runs this effect, and the flag is
    // cleared on first read.
    if (!scrollIntentRef.current.read) {
      scrollIntentRef.current = {
        read: true,
        toInput: consumeClawV5ScrollToInput(),
      };
    }

    // Mobile only — on md+ the content fits and the centered layout looks right.
    const isMobile = !window.matchMedia("(min-width: 768px)").matches;
    if (!isMobile || !scrollIntentRef.current.toInput) {
      el.scrollTop = 0;
      return;
    }

    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    // Images/fonts settle after first paint and grow the content — re-pin.
    const rafId = requestAnimationFrame(toBottom);
    const timerId = window.setTimeout(toBottom, 300);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, [isSending]);

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

  // Fetch chats from backend (only once)
  useEffect(() => {
    const fetchChats = async () => {
      if (!currentUserId || hasFetched) return;

      setIsLoading(true);
      try {
        const res = await fetch(`/api/claw-v5/chats?userId=${currentUserId}`);
        if (res.ok) {
          const data = await res.json();
          const fetchedChats: Chat[] = data.chats || [];

          // Save to localStorage
          saveChatsToStorage(fetchedChats);

          // Load from localStorage
          const storedChats = getChatsFromStorage();
          setChats(storedChats);
          setHasFetched(true);
        } else {
          // If fetch fails, try loading from localStorage
          const storedChats = getChatsFromStorage();
          setChats(storedChats);
        }
      } catch (error) {
        console.error("Error fetching chats:", error);
        // Fallback to localStorage
        const storedChats = getChatsFromStorage();
        setChats(storedChats);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChats();
  }, [currentUserId, hasFetched]);

  // Load chats from localStorage on mount
  useEffect(() => {
    if (!hasFetched) {
      const storedChats = getChatsFromStorage();
      setChats(storedChats as Chat[]);
    }
  }, [hasFetched]);

  const handleNewChat = useCallback(() => {
    // On main page, do nothing - user is already on the new chat page
    // Just stay on the current page
  }, []);

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

          // Update chats list (only update the specific chat)
          setChats((prevChats) => {
            // Find the index of the chat to update
            const chatIndex = prevChats.findIndex((c) => c.id === chatId);
            if (chatIndex === -1) {
              // Chat not found, add it to the list
              return [
                { ...updatedChat, messages: updatedChat.messages || [] },
                ...prevChats,
              ];
            }

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
    [],
  );

  const handleChatDelete = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/claw-v5/chats/${chatId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // Remove from localStorage
        const { deleteChatFromStorage } =
          await import("@/lib/storage/chatStorage");
        deleteChatFromStorage(chatId);

        // Update chats list (remove the deleted chat)
        setChats((prevChats) => prevChats.filter((c) => c.id !== chatId));

        // Show success notification
        showSuccessNotification(
          "Chat Deleted",
          "The chat has been successfully removed.",
        );
      } else {
        throw new Error("Failed to delete chat");
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      showErrorNotification("Error", "Failed to delete chat");
      throw error; // Re-throw to let modal handle it
    }
  }, []);

  const handleSendMessage = useCallback(
    async (message: string, quotedContent?: string, context?: ClawSelectionContext) => {
      if (!currentUserId || !message.trim() || isSending) return;

      setIsSending(true);
      try {
        const chatRes = await fetch("/api/claw-v5/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            title: message.substring(0, 50) || "New Chat",
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const newChat = chatData.chat;

          saveChatToStorage(newChat);
          setChats(getChatsFromStorage());

          if (typeof window !== "undefined") {
            sessionStorage.setItem("claw-v5-skip-initial-scroll", newChat.id);
            sessionStorage.setItem(
              CLAW_V5_PENDING_STREAM_KEY,
              JSON.stringify({
                chatId: newChat.id,
                message,
                quotedContent: quotedContent || undefined,
                marketMode,
                context: context ?? undefined,
              }),
            );
          }

          router.replace(`/claw-v5/${newChat.id}`);
        } else {
          setIsSending(false);
        }
      } catch (error) {
        console.error("Error creating chat:", error);
        setIsSending(false);
      }
    },
    [currentUserId, router, isSending, marketMode],
  );

  const handleStop = useCallback(() => {
    /* Stream runs on the chat detail page after redirect. */
  }, []);

  const MARKET_SAMPLE_PROMPT =
    "Rex Markets: What are Polymarket and Kalshi odds for the next Fed interest rate decision?";
  const CRYPTO_SAMPLE_PROMPT =
    "Crypto: Is $SOL leaning bullish or bearish on the 15m—key levels, invalidation, and a quick trade plan?";

  const stripLeadingLabel = (text: string) =>
    text
      .replace(/^Rex\s+Markets:\s*/i, "")
      .replace(/^Crypto:\s*/i, "")
      .trim();

  /** Prompt cards: the spotlight follows the pointer (prototype hover). */
  const trackSpotlight = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <>
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <RexHeader onHistoryClick={() => {}} showExchangeButton={false} />

      {/* Main Content */}
      <div className={clsx("claw", isSending && "is-thinking")}>
        <ClawAura />

        <ChatSidebar
          chats={chats}
          isLoading={isLoading}
          onNewChat={handleNewChat}
          onChatRename={handleChatRename}
          onChatDelete={handleChatDelete}
          isMobileOpen={isSidebarOpen}
          onMobileClose={() => setIsSidebarOpen(false)}
          collapsed={isChatSidebarCollapsed}
          onCollapsedChange={setIsChatSidebarCollapsed}
        />

        <section
          className={clsx("claw-main", isSending && "is-thinking")}
          aria-label="Claw AI conversation"
        >
          {/* Mobile: open the chats drawer */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="rx-icon-btn claw-toggle md:hidden"
            aria-label="Open chats"
            aria-expanded={isSidebarOpen}
          >
            <PanelLeft className="size-[18px]" aria-hidden="true" />
          </button>

          {/* Scroll matches chat thread: custom scrollbar + min-h-0 flex fix */}
          <div
            ref={welcomeScrollRef}
            className="claw-scroll custom-chat-messages-scrollbar"
          >
            <div className="claw-col">
              {isSending ? (
                <div className="claw-status" role="status" aria-live="polite">
                  <span className="rx-spin" aria-hidden="true" />
                  <p className="m-0">Opening chat…</p>
                </div>
              ) : (
                <div className="claw-empty">
                  <Image
                    className="claw-hero"
                    src="/images/claw-hero.webp"
                    alt=""
                    width={232}
                    height={232}
                    priority
                  />

                  {/* Welcome Message */}
                  <h1>
                    Claw AI 5.0: The Thinking Engine for
                    <br />
                    <em>Prediction Markets &amp; Crypto</em>
                  </h1>

                  {/* Sample Prompts */}
                  <div
                    className="claw-prompts"
                    role="list"
                    aria-label="Example questions"
                  >
                    <button
                      type="button"
                      role="listitem"
                      onPointerMove={trackSpotlight}
                      onClick={() =>
                        setPrefillText(stripLeadingLabel(MARKET_SAMPLE_PROMPT))
                      }
                      disabled={!authenticated}
                      className="claw-prompt"
                    >
                      <span className="claw-prompt__ico" aria-hidden="true">
                        <Clock />
                      </span>
                      <span className="claw-prompt__text">
                        <span className="claw-prompt__label">Markets prompt</span>
                        <span className="claw-prompt__q">
                          {stripLeadingLabel(MARKET_SAMPLE_PROMPT)}
                        </span>
                      </span>
                      <span className="claw-prompt__go" aria-hidden="true">
                        <ArrowRight className="size-4" />
                      </span>
                    </button>

                    <button
                      type="button"
                      role="listitem"
                      onPointerMove={trackSpotlight}
                      onClick={() =>
                        setPrefillText(stripLeadingLabel(CRYPTO_SAMPLE_PROMPT))
                      }
                      disabled={!authenticated}
                      className="claw-prompt claw-prompt--ember"
                    >
                      <span className="claw-prompt__ico" aria-hidden="true">
                        <TrendingUp />
                      </span>
                      <span className="claw-prompt__text">
                        <span className="claw-prompt__label">Crypto prompt</span>
                        <span className="claw-prompt__q">
                          {stripLeadingLabel(CRYPTO_SAMPLE_PROMPT)}
                        </span>
                      </span>
                      <span className="claw-prompt__go" aria-hidden="true">
                        <ArrowRight className="size-4" />
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chat Input */}
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isSending}
            onStop={handleStop}
            placeholder="Search Prediction Events, Arbitrage, Wallets, Cryptocurrencies and more!"
            prefillText={prefillText}
            marketMode={marketMode}
            onMarketModeChange={setMarketMode}
            disabled={!authenticated}
            disabledPlaceholder="Sign in to chat"
            intro
          />
        </section>
      </div>

      {/* Footer */}
      <Footer />
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
