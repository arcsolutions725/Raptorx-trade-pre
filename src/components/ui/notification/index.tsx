"use client";

import { toast } from "react-toastify";

export interface NotificationOptions {
  position?: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
  autoClose?: number | false;
  hideProgressBar?: boolean;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
  draggable?: boolean;
}

const defaultOptions: NotificationOptions = {
  position: "top-center",
  autoClose: 5000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

/**
 * Show a success notification with title and message
 */
export function showSuccessNotification(
  title: string,
  message: string,
  options?: NotificationOptions
) {
  const mergedOptions = { ...defaultOptions, ...options };
  
  toast.success(
    <div>
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
        {title}
      </div>
      <div>{message}</div>
    </div>,
    mergedOptions
  );
}

/**
 * Show an error notification with title and message
 */
export function showErrorNotification(
  title: string,
  message: string,
  options?: NotificationOptions
) {
  const mergedOptions = { ...defaultOptions, ...options };
  
  toast.error(
    <div>
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
        {title}
      </div>
      <div>{message}</div>
    </div>,
    mergedOptions
  );
}

/**
 * Show an info notification with title and message
 */
export function showInfoNotification(
  title: string,
  message: string,
  options?: NotificationOptions
) {
  const mergedOptions = { ...defaultOptions, ...options };
  
  toast.info(
    <div>
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
        {title}
      </div>
      <div>{message}</div>
    </div>,
    mergedOptions
  );
}

/**
 * Show a warning notification with title and message
 */
export function showWarningNotification(
  title: string,
  message: string,
  options?: NotificationOptions
) {
  const mergedOptions = { ...defaultOptions, ...options };
  
  toast.warning(
    <div>
      <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
        {title}
      </div>
      <div>{message}</div>
    </div>,
    mergedOptions
  );
}

