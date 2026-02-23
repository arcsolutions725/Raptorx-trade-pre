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
  chatId,
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

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg p-1 min-w-[180px] z-50 shadow-lg"
    >
      <button
        onClick={() => {
          onRename();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-white/80 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
      >
        <Pencil className="w-4 h-4" />
        <span>Rename</span>
      </button>

      <button
        onClick={() => {
          onOpenInNewTab();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-white/80 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        <span>Open in New Tab</span>
      </button>

      <div className="border-t border-[#3a3a3a] my-1"></div>

      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        <span>Delete</span>
      </button>
    </div>
  );
}

