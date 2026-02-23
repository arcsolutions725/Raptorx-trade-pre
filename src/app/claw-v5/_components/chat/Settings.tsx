"use client";

import { Copy, Pin, Pencil, ThumbsUp, ThumbsDown, RotateCcw, MoreVertical } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface SettingsProps {
  messageId: string;
  content: string;
  onEdit?: (messageId: string, newContent: string) => void;
  onCopy?: (content: string) => void;
  onClose: () => void;
}

export default function Settings({
  messageId,
  content,
  onEdit,
  onCopy,
  onClose,
}: SettingsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
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

  const handleCopy = () => {
    if (onCopy) {
      onCopy(content);
    } else {
      navigator.clipboard.writeText(content);
    }
    onClose();
  };

  const handleEdit = () => {
    if (isEditing && onEdit) {
      onEdit(messageId, editedContent);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (onEdit) {
      onEdit(messageId, editedContent);
    }
    setIsEditing(false);
    onClose();
  };

  if (isEditing) {
    return (
      <div
        ref={menuRef}
        className="absolute right-0 top-8 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg p-3 min-w-[300px] z-50"
      >
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full bg-[#1a1a1a] text-white p-2 rounded border border-[#3a3a3a] focus:outline-none focus:ring-1 focus:ring-[#FFC000] mb-2"
          rows={4}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => {
              setIsEditing(false);
              setEditedContent(content);
            }}
            className="px-3 py-1 text-gray-400 hover:text-white text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-[#FFC000] text-black rounded hover:bg-[#FFD000] text-sm"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-8 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg p-2 min-w-[200px] z-50 shadow-lg"
    >
      <div className="space-y-1">
        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <Copy className="w-4 h-4" />
          <span>Copy</span>
        </button>

        <button
          onClick={() => {
            // Pin functionality
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <Pin className="w-4 h-4" />
          <span>Pin</span>
        </button>

        <button
          onClick={handleEdit}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <Pencil className="w-4 h-4" />
          <span>Edit</span>
        </button>

        <div className="border-t border-[#3a3a3a] my-1"></div>

        <button
          onClick={() => {
            // Thumbs up functionality
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <ThumbsUp className="w-4 h-4" />
          <span>Good response</span>
        </button>

        <button
          onClick={() => {
            // Thumbs down functionality
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <ThumbsDown className="w-4 h-4" />
          <span>Poor response</span>
        </button>

        <button
          onClick={() => {
            // Regenerate functionality
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Regenerate</span>
        </button>

        <button
          onClick={() => {
            // More options
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-gray-300 hover:bg-[#3a3a3a] rounded text-sm transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
          <span>More</span>
        </button>
      </div>
    </div>
  );
}

