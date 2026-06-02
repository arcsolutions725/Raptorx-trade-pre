"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";

interface RenameChatModalProps {
  isOpen: boolean;
  currentTitle: string;
  onSave: (newTitle: string) => Promise<void>;
  onClose: () => void;
}

export default function RenameChatModal({
  isOpen,
  currentTitle,
  onSave,
  onClose,
}: RenameChatModalProps) {
  const [newTitle, setNewTitle] = useState(currentTitle);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewTitle(currentTitle);
      setIsSaving(false);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, currentTitle]);

  if (!isOpen) return null;

  const hasChanged = newTitle.trim() !== currentTitle.trim();
  const isValid = newTitle.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasChanged || !isValid || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(newTitle.trim());
      // Reset saving state before closing
      setIsSaving(false);
      // Wait a bit for notification to show, then close modal
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error("Error saving chat title:", error);
      // Don't close modal on error - let user try again
      setIsSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent closing when clicking backdrop during save
    if (isSaving) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 w-full max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white text-base font-semibold">Rename Chat</h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={isSaving}
            className="w-full bg-[#262626] border border-[#3C3C3C] text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#FFC000] mb-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter chat title"
          />

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasChanged || !isValid || isSaving}
              className="px-3 py-1.5 bg-[#FFC000] text-black rounded hover:bg-[#FFD000] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isSaving ? "Saving..." : "Save"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Render modal using portal to document body to ensure it's centered on full page
  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  }
  return null;
}

