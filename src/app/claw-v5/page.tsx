"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { usePhantomConnect } from "@/components/providers/PhantomConnectProvider";
import Image from "next/image";
import ChatSidebar, {
  clawV5HeaderNavShiftPx,
} from "./_components/chat/ChatSidebar";
import ChatInput, {
  type PredictionMarketMode,
  type ClawSelectionContext,
} from "./_components/chat/ChatInput";
import { CLAW_V5_PENDING_STREAM_KEY } from "@/lib/clawV5/streamingReportDisplay";
import RexHeader from "@/components/ui/layout/Header";
import Footer from "@/components/ui/layout/Footer";
import {
  getChatsFromStorage,
  saveChatsToStorage,
  saveChatToStorage,
  Chat,
} from "@/lib/storage/chatStorage";
import { Loader2, Menu } from "lucide-react";
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
  const [marketMode, setMarketMode] = useState<PredictionMarketMode>("Markets");
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallLimitCode, setPaywallLimitCode] = useState<PaywallLimitCode | null>(null);

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
          <div className="flex min-h-0 flex-1 overflow-hidden bg-black border-y-2 border-[#FFC000] relative">
            {/* Mobile Sidebar Toggle Button - Top Left */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden absolute top-4 left-4 z-20 text-white/80 hover:text-white transition-colors"
              aria-label="Open sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>

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

            <div className="flex-1 flex flex-col bg-black min-w-0 min-h-0">
              {/* Scroll matches chat thread: custom scrollbar + min-h-0 flex fix */}
              <div className="flex-1 overflow-y-auto overflow-x-clip min-h-0 custom-chat-messages-scrollbar px-2 md:px-4 pt-14 md:pt-8 pb-2">
                <div
                  className={`mx-auto w-full max-w-4xl flex flex-col pb-3 md:pb-6 ${
                    isSending
                      ? "items-stretch justify-start gap-3 min-h-0"
                      : "items-center justify-center min-h-full p-3 md:p-8"
                  }`}
                >
                {isSending ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-[#FFC000] animate-spin" />
                    <p className="text-sm text-white/70 text-center px-4">
                      Opening chat…
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Claw v5 Icon */}
                    <div className="mb-4 md:mb-8 w-14 h-14 md:w-24 md:h-24 relative">
                      <Image
                        src="/images/claw-v5.webp"
                        alt="Claw v5"
                        fill
                        className="object-contain"
                        priority
                      />
                    </div>

                    {/* Welcome Message */}
                    <h1 className="text-lg md:text-xl font-semibold! text-white/85 mb-4 md:mb-8 text-center px-2 md:px-4 leading-snug max-w-[22rem] md:max-w-none">
                      Claw: The Thinking Engine for Prediction Markets & Crypto
                    </h1>

                    {/* Sample Prompts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-md md:max-w-4xl w-full mb-6 md:mb-8 px-0 md:px-4">
                      <button
                        onClick={() =>
                          setPrefillText(
                            stripLeadingLabel(MARKET_SAMPLE_PROMPT),
                          )
                        }
                        disabled={!authenticated}
                        className="bg-[#141414] border border-[#3C3C3C] hover:border-[#FFC000]/40 rounded-2xl p-4 md:p-6 text-left transition-colors w-full shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-[#3C3C3C]"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <span className="w-11 h-11 flex items-center justify-center overflow-hidden">
                            <Image
                              src="/images/market-prompt.webp"
                              alt="Markets Prompt"
                              width={28}
                              height={28}
                              className="w-11 h-11 object-contain"
                              priority
                            />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-white/90 font-semibold text-sm!">
                              Markets Prompt Example
                            </h3>
                          </div>
                        </div>
                        <p className="text-[#A3A3A3] text-xs leading-relaxed">
                          {stripLeadingLabel(MARKET_SAMPLE_PROMPT)}
                        </p>
                      </button>

                      <button
                        onClick={() =>
                          setPrefillText(
                            stripLeadingLabel(CRYPTO_SAMPLE_PROMPT),
                          )
                        }
                        disabled={!authenticated}
                        className="bg-[#141414] border border-[#3C3C3C] hover:border-[#FFC000]/40 rounded-2xl p-4 md:p-6 text-left transition-colors w-full shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-[#3C3C3C]"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <span className="w-11 h-11 flex items-center justify-center overflow-hidden">
                            <Image
                              src="/images/crypto-prompt.webp"
                              alt="Crypto Prompt"
                              width={28}
                              height={28}
                              className="w-11 h-11 object-contain"
                              priority
                            />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-white/90 font-semibold text-sm!">
                              Crypto Prompt Example
                            </h3>
                          </div>
                        </div>
                        <p className="text-[#A3A3A3] text-xs leading-relaxed">
                          {stripLeadingLabel(CRYPTO_SAMPLE_PROMPT)}
                        </p>
                      </button>
                    </div>
                  </>
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
              />
            </div>
          </div>

          {/* Footer */}
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
