"use client";

import { Toaster } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";

const iconSize = 18;
const iconClassName = "shrink-0";

export function NotificationToaster() {
  return (
    <Toaster
      position="top-center"
      theme="dark"
      icons={{
        success: (
          <CheckCircle2
            size={iconSize}
            className={`${iconClassName} text-emerald-500`}
            aria-hidden
          />
        ),
        error: (
          <XCircle
            size={iconSize}
            className={`${iconClassName} text-red-500`}
            aria-hidden
          />
        ),
        warning: (
          <AlertTriangle
            size={iconSize}
            className={`${iconClassName} text-amber-500`}
            aria-hidden
          />
        ),
        info: (
          <Info
            size={iconSize}
            className={`${iconClassName} text-blue-500`}
            aria-hidden
          />
        ),
        loading: (
          <Loader2
            size={iconSize}
            className={`${iconClassName} text-blue-500 animate-spin`}
            aria-hidden
          />
        ),
      }}
    />
  );
}
