"use client";

import { toast } from "sonner";
import type { ExternalToast } from "sonner";

export { NotificationToaster } from "./NotificationToaster";

export interface NotificationOptions {
  duration?: number;
  description?: string;
  /** Sonner placement; defaults to the app Toaster position when omitted. */
  position?: ExternalToast["position"];
}

/**
 * Show a success notification with title and message
 */
export function showSuccessNotification(
  title: string,
  message?: string,
  options?: NotificationOptions
) {
  toast.success(title, {
    description: message,
    duration: options?.duration ?? 5000,
    ...(options?.position ? { position: options.position } : {}),
  });
}

/**
 * Show an error notification with title and message
 */
export function showErrorNotification(
  title: string,
  message?: string,
  options?: NotificationOptions
) {
  toast.error(title, {
    description: message,
    duration: options?.duration ?? 5000,
    ...(options?.position ? { position: options.position } : {}),
  });
}

/**
 * Show an info notification with title and message
 */
export function showInfoNotification(
  title: string,
  message?: string,
  options?: NotificationOptions
) {
  toast.info(title, {
    description: message,
    duration: options?.duration ?? 5000,
    ...(options?.position ? { position: options.position } : {}),
  });
}

/**
 * Show a warning notification with title and message
 */
export function showWarningNotification(
  title: string,
  message?: string,
  options?: NotificationOptions
) {
  toast.warning(title, {
    description: message,
    duration: options?.duration ?? 5000,
    ...(options?.position ? { position: options.position } : {}),
  });
}

