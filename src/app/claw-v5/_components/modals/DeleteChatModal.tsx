"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, Loader2 } from "lucide-react";

interface DeleteChatModalProps {
  isOpen: boolean;
  chatTitle: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function DeleteChatModal({
  isOpen,
  chatTitle,
  onConfirm,
  onClose,
}: DeleteChatModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsDeleting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await onConfirm();
      // Reset deleting state before closing
      setIsDeleting(false);
      // Wait a bit for notification to show, then close modal
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error("Error deleting chat:", error);
      // Don't close modal on error - let user try again
      setIsDeleting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent closing when clicking backdrop during delete
    if (isDeleting) return;
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
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 w-full max-w-xs overflow-hidden min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 min-w-0">
          <h2 className="text-white text-base font-semibold truncate pr-2">Delete Chat</h2>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-shrink-0 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4 min-w-0">
          <div className="flex items-center gap-2 mb-2 min-w-0">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <p className="text-white text-sm min-w-0">
              Are you sure you want to delete this chat?
            </p>
          </div>
          <p className="text-gray-400 text-xs pl-6 break-all min-w-0">
            "{chatTitle}" will be permanently deleted. This action cannot be undone.
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-3 py-1.5 text-gray-400 hover:text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );

  // Render modal using portal to document body to ensure it's centered on full page
  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  }
  return null;
}

