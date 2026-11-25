"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  BookOpen,
  MoreHorizontal,
  PanelLeft,
  Ellipsis,
  X,
} from "lucide-react";
import clsx from "clsx";

import type { Chat } from "@/lib/storage/chatStorage";
import ChatContextMenu from "./ChatContextMenu";
import RenameChatModal from "../modals/RenameChatModal";
import DeleteChatModal from "../modals/DeleteChatModal";

/** Sidebar widths (px) on md+: collapsed rail and expanded panel. */
export const CLAW_CHAT_SIDEBAR_WIDTH_COLLAPSED_PX = 76;
export const CLAW_CHAT_SIDEBAR_WIDTH_EXPANDED_PX = 280;

/**
 * Kept for compatibility. The redesigned header keeps its nav next to the logo, so the
 * claw-v5 pages no longer shift it with the sidebar width.
 */
export function clawV5HeaderNavShiftPx(sidebarCollapsed: boolean): number {
  if (sidebarCollapsed) return 0;
  return (
    (CLAW_CHAT_SIDEBAR_WIDTH_EXPANDED_PX - CLAW_CHAT_SIDEBAR_WIDTH_COLLAPSED_PX) /
    2
  );
}

export const CLAW_LIBRARY_HREF = "/claw-v5/library";

interface ChatSidebarProps {
  chats: Chat[];
  isLoading?: boolean;
  onNewChat: () => void;
  onChatSelect?: (chatId: string) => void;
  onChatRename?: (chatId: string, newTitle: string) => void;
  onChatDelete?: (chatId: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Controlled collapse (narrow rail on md+). Omit for uncontrolled local state. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
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
      <li className={clsx("claw-hist__item", isActive && "is-active")}>
        <button
          type="button"
          onClick={onClick}
          className="claw-hist__link"
          aria-current={isActive ? "true" : undefined}
          title={chat.title}
        >
          {chat.title}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="claw-hist__more"
          aria-label={`Options for ${chat.title}`}
          aria-haspopup="menu"
          aria-expanded={showMenu}
        >
          <Ellipsis className="size-4" aria-hidden="true" />
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
      </li>

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
  collapsed: collapsedProp,
  onCollapsedChange,
}: ChatSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed =
    collapsedProp !== undefined ? collapsedProp : internalCollapsed;

  const setCollapsed = (next: boolean) => {
    if (collapsedProp === undefined) {
      setInternalCollapsed(next);
    }
    onCollapsedChange?.(next);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllChats, setShowAllChats] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const prevPathnameRef = useRef<string>(pathname);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Escape closes the mobile drawer
  useEffect(() => {
    if (!isMobileOpen || !onMobileClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobileOpen, onMobileClose]);

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

  const expandAndSearch = () => {
    setCollapsed(false);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={clsx("claw-scrim", isMobileOpen && "is-open")}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      <aside
        className={clsx(
          "claw-side",
          isCollapsed && "is-collapsed",
          isMobileOpen && "is-open",
        )}
        aria-label="Chats"
      >
        <div className="claw-side__head">
          <div className="claw-side__brand">
            <span className="claw-mark" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="claw-ico claw-logo"
                src="/images/claw-logo-96.webp"
                width={22}
                height={22}
                alt=""
              />
            </span>
            Claw <em>5.0</em>
          </div>
          {/* Mobile: close the drawer */}
          {isMobileOpen && onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="rx-icon-btn panel-ctl md:hidden"
              aria-label="Close chats"
              title="Close chats"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
          {/* Desktop: collapse to a rail / expand */}
          <button
            type="button"
            onClick={() => setCollapsed(!isCollapsed)}
            className="rx-icon-btn panel-ctl hidden md:inline-flex"
            aria-label={isCollapsed ? "Expand chats" : "Collapse chats"}
            title={isCollapsed ? "Expand chats" : "Collapse chats"}
            aria-expanded={!isCollapsed}
          >
            <PanelLeft className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Collapsed rail (md+ only, see claw.css) */}
        <div className="claw-side__rail">
          <button
            type="button"
            onClick={onNewChat}
            className="rx-icon-btn"
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={expandAndSearch}
            className="rx-icon-btn"
            title="Search chats"
            aria-label="Search chats"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
          <Link
            href={CLAW_LIBRARY_HREF}
            className="rx-icon-btn"
            title="Library"
            aria-label="Library"
          >
            <BookOpen className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="claw-side__full">
          <button
            type="button"
            onClick={onNewChat}
            className="rx-btn rx-btn--ghost claw-side__new"
          >
            <Plus className="size-[18px]" aria-hidden="true" />
            New chat
          </button>

          <label className="rx-input claw-side__search">
            <Search className="size-3.5 shrink-0 text-rx-text-3" aria-hidden="true" />
            <span className="sr-only">Search chats</span>
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                const q = searchQuery.trim();
                if (e.key === "Enter" && q) {
                  router.push(
                    `${CLAW_LIBRARY_HREF}?q=${encodeURIComponent(q)}`,
                  );
                }
              }}
              autoComplete="off"
            />
          </label>

          <Link
            href={CLAW_LIBRARY_HREF}
            className="rx-btn rx-btn--ghost claw-side__link"
          >
            <BookOpen className="size-4" aria-hidden="true" />
            Library
          </Link>

          <span className="rx-eyebrow claw-side__label">Chats</span>

          {chats.length === 0 && !isLoading ? (
            <p className="claw-hist__empty">
              {searchQuery ? "No chats found" : "No chats yet"}
            </p>
          ) : filteredChats.length > 0 ? (
            <ul className="claw-hist custom-chat-messages-scrollbar">
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
              {filteredChats.length > 6 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowAllChats(!showAllChats)}
                    className="rx-btn rx-btn--ghost rx-btn--s claw-side__link mt-2"
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                    {showAllChats ? "Show less" : "See more"}
                  </button>
                </li>
              )}
            </ul>
          ) : searchQuery && chats.length > 0 ? (
            <p className="claw-hist__empty">No chats found</p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export default ChatSidebar;
