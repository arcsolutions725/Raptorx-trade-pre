"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";

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
    <div className="rx-claw">
      <div
        className="claw-modal-root"
        onClick={handleBackdropClick}
      >
        <div
          className="claw-modal min-w-0"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="claw-delete-title"
          aria-describedby="claw-delete-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="claw-modal__head">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--rx-down-line)] bg-rx-down-tint text-rx-down"
              aria-hidden="true"
            >
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 id="claw-delete-title">Delete chat?</h2>
              <p id="claw-delete-desc">
                &ldquo;{chatTitle}&rdquo; will be permanently deleted. This
                action cannot be undone.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="rx-icon-btn rx-icon-btn--s disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="claw-modal__foot">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="rx-btn rx-btn--secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDeleting}
              className="rx-btn rx-btn--danger"
            >
              {isDeleting && <span className="rx-spin" aria-hidden="true" />}
              <span>{isDeleting ? "Deleting..." : "Delete"}</span>
            </button>
          </div>
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

