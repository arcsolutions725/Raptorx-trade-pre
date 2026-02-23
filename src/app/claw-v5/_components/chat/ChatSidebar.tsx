"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  BarChart3,
  MoreHorizontal,
  ArrowLeftToLine,
  Ellipsis,
  X,
} from "lucide-react";
import Image from "next/image";

import type { Chat } from "@/lib/storage/chatStorage";
import ChatContextMenu from "./ChatContextMenu";
import RenameChatModal from "../modals/RenameChatModal";
import DeleteChatModal from "../modals/DeleteChatModal";

interface ChatSidebarProps {
  chats: Chat[];
  isLoading?: boolean;
  onNewChat: () => void;
  onChatSelect?: (chatId: string) => void;
  onChatRename?: (chatId: string, newTitle: string) => void;
  onChatDelete?: (chatId: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
  onRename?: (chatId: string, newTitle: string) => void;
  onDelete?: (chatId: string) => void;
}

function ChatItem({
  chat,
  isActive,
  onClick,
  onRename,
  onDelete,
}: ChatItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const router = useRouter();

  const handleRename = async (newTitle: string) => {
    if (onRename) {
      await onRename(chat.id, newTitle);
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(chat.id);
    }
  };

  const handleOpenInNewTab = () => {
    window.open(`/claw-v5/${chat.id}`, "_blank");
  };

  return (
    <>
      <div
        className={`group relative w-full flex items-center gap-2 px-3 h-9 rounded-xl transition-colors ${
          isActive
            ? "bg-[#262626] text-[#FFC000]"
            : "text-white/80 hover:text-white hover:bg-[#262626]"
        }`}
      >
        <button
          onClick={onClick}
          className="flex-1 text-left truncate"
          style={{ fontSize: "14px" }}
        >
          {chat.title}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[#3a3a3a] rounded"
        >
          <Ellipsis className="w-4 h-4" />
        </button>
        {showMenu && (
          <ChatContextMenu
            chatId={chat.id}
            onRename={() => setShowRenameModal(true)}
            onOpenInNewTab={handleOpenInNewTab}
            onDelete={() => setShowDeleteModal(true)}
            onClose={() => setShowMenu(false)}
          />
        )}
      </div>

      {showRenameModal && (
        <RenameChatModal
          isOpen={showRenameModal}
          currentTitle={chat.title}
          onSave={handleRename}
          onClose={() => setShowRenameModal(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteChatModal
          isOpen={showDeleteModal}
          chatTitle={chat.title}
          onConfirm={handleDelete}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}

function ChatSidebar({
  chats,
  isLoading = false,
  onNewChat,
  onChatSelect,
  onChatRename,
  onChatDelete,
  isMobileOpen = false,
  onMobileClose,
}: ChatSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllChats, setShowAllChats] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const prevPathnameRef = useRef<string>(pathname);

  // Close mobile sidebar when route changes (but not on initial mount or when opening)
  useEffect(() => {
    // Only close if pathname actually changed (not just on mount or when isMobileOpen changes)
    if (prevPathnameRef.current !== pathname && isMobileOpen && onMobileClose) {
      onMobileClose();
    }
    prevPathnameRef.current = pathname;
  }, [pathname, isMobileOpen, onMobileClose]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Show top 6 chats initially, or all if showAllChats is true
  const displayedChats = showAllChats
    ? filteredChats
    : filteredChats.slice(0, 6);

  const handleChatClick = (chatId: string) => {
    if (onChatSelect) {
      onChatSelect(chatId);
    }
    router.push(`/claw-v5/${chatId}`);
  };

  const isChatActive = (chatId: string) => {
    return pathname === `/claw-v5/${chatId}`;
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
          isMobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={onMobileClose}
      />

      {/* Sidebar */}
      <div
        className={`bg-[#1a1a1a] border-r border-[#2a2a2a] flex flex-col h-full transition-transform duration-300 ease-in-out
          ${isCollapsed ? "w-16" : "w-64"}
          ${
            isMobileOpen
              ? "fixed left-0 top-0 z-50 transform translate-x-0"
              : "fixed left-0 top-0 z-50 transform -translate-x-full"
          }
          md:relative md:z-auto md:transform-none md:translate-x-0
        `}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-4 border-b border-white/10 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <p className="text-white font-normal text-[16px]">
                <span>Claw </span>
                <span className="text-[#ffc000]">Version </span>
                <span className="text-[#D5320A]">5</span>
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* Mobile Close Button */}
            {isMobileOpen && onMobileClose && (
              <button
                onClick={onMobileClose}
                className="p-1 rounded transition-colors hover:bg-[#2a2a2a] md:hidden"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5 text-white/80" />
              </button>
            )}
            {/* Collapse Button - Hidden on mobile */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden md:block p-1 rounded transition-colors hover:bg-[#2a2a2a]"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ArrowLeftToLine
                className={`w-4 h-5 text-white/80 transition-transform ${
                  isCollapsed ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div
          className={`px-4 pt-3 pb-4 space-y-3 border-b border-white/10 ${isCollapsed ? "flex flex-col items-center gap-3" : ""}`}
        >
          <button
            onClick={onNewChat}
            className={`${isCollapsed ? "w-10 h-10 flex items-center justify-center" : "w-full flex items-center gap-2 px-3 h-10"} text-white/80 hover:text-white transition-colors text-sm`}
            style={{ fontSize: "14px" }}
            title={isCollapsed ? "New chat" : undefined}
          >
            <Plus className="w-5 h-5" />
            {!isCollapsed && <span>New chat</span>}
          </button>

          {!isCollapsed ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/80" />
              <input
                type="text"
                placeholder="Search chats"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 h-10 bg-[#262626] border border-[#3C3C3C] text-white/80 placeholder-white/50 rounded focus:outline-none focus:ring-1 focus:ring-[#FFC000] text-sm"
                style={{ fontSize: "14px" }}
              />
            </div>
          ) : (
            <button
              className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white transition-colors"
              title="Search chats"
            >
              <Search className="w-5 h-5" />
            </button>
          )}

          <button
            className={`${isCollapsed ? "w-10 h-10 flex items-center justify-center" : "w-full flex items-center gap-2 px-3 h-10"} text-white/80 hover:text-white transition-colors text-sm`}
            style={{ fontSize: "14px" }}
            title={isCollapsed ? "Library" : undefined}
          >
            <BarChart3 className="w-4 h-4" />
            {!isCollapsed && <span>Library</span>}
          </button>
        </div>

        {!isCollapsed && (
          <>
            {/* Chats Section */}
            <div className="flex-1 overflow-y-auto px-4 pt-5.5 pb-4 custom-chat-messages-scrollbar">
              <div className="mb-2">
                <h3
                  className="text-[#FFC000] uppercase tracking-wider mb-2"
                  style={{ fontSize: "12px" }}
                >
                  CHATS
                </h3>
              </div>

              {chats.length === 0 && !isLoading ? (
                <div
                  className="text-white/80 text-sm"
                  style={{ fontSize: "14px" }}
                >
                  {searchQuery ? "No chats found" : "No chats yet"}
                </div>
              ) : filteredChats.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {displayedChats.map((chat) => (
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      isActive={isChatActive(chat.id)}
                      onClick={() => handleChatClick(chat.id)}
                      onRename={onChatRename}
                      onDelete={onChatDelete}
                    />
                  ))}
                </div>
              ) : searchQuery && chats.length > 0 ? (
                <div
                  className="text-white/80 text-sm"
                  style={{ fontSize: "14px" }}
                >
                  No chats found
                </div>
              ) : null}

              {filteredChats.length > 6 && (
                <button
                  onClick={() => setShowAllChats(!showAllChats)}
                  className="mt-4 w-full flex items-center gap-2 px-3 py-2 text-white/80 hover:text-white transition-colors text-sm"
                  style={{ fontSize: "14px" }}
                >
                  <MoreHorizontal className="w-4 h-4" />
                  <span>{showAllChats ? "Show less" : "See more"}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default ChatSidebar;
