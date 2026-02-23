"use client";

import { toast } from "sonner";

export { NotificationToaster } from "./NotificationToaster";

export interface NotificationOptions {
  duration?: number;
  description?: string;
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
  });
}

