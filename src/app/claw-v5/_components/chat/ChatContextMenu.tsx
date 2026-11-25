"use client";

import { useRef, useEffect } from "react";
import { Pencil, ExternalLink, Trash2 } from "lucide-react";

interface ChatContextMenuProps {
  chatId: string;
  onRename: () => void;
  onOpenInNewTab: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function ChatContextMenu({
  chatId: _chatId,
  onRename,
  onOpenInNewTab,
  onDelete,
  onClose,
}: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div ref={menuRef} className="rx-menu claw-hist__menu" role="menu">
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onRename();
          onClose();
        }}
        className="rx-menu__item"
      >
        <Pencil aria-hidden="true" />
        <span>Rename</span>
      </button>

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpenInNewTab();
          onClose();
        }}
        className="rx-menu__item"
      >
        <ExternalLink aria-hidden="true" />
        <span>Open in new tab</span>
      </button>

      <div className="my-1 h-px bg-rx-line" role="separator" />

      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="rx-menu__item is-danger"
      >
        <Trash2 aria-hidden="true" />
        <span>Delete</span>
      </button>
    </div>
  );
}
