"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
    <div className="rx-claw">
      <div
        className="claw-modal-root"
        onClick={handleBackdropClick}
      >
        <div
          className="claw-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="claw-rename-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="claw-modal__head">
            <div className="min-w-0">
              <h2 id="claw-rename-title">Rename chat</h2>
              <p>Give this chat a name you will recognise later.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rx-icon-btn rx-icon-btn--s disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="claw-modal__body">
              <label className="rx-field">
                <span className="rx-label">Chat name</span>
                <span className="rx-input">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={isSaving}
                    className="text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Enter chat title"
                  />
                </span>
              </label>
            </div>

            <div className="claw-modal__foot">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rx-btn rx-btn--secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!hasChanged || !isValid || isSaving}
                className="rx-btn rx-btn--primary"
              >
                {isSaving && <span className="rx-spin" aria-hidden="true" />}
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </form>
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

