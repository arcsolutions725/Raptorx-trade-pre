"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "@posthog/react";
import { usePrivy } from "@privy-io/react-auth";

const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_TOKEN ||
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export const isPostHogConfigured = Boolean(POSTHOG_KEY && POSTHOG_HOST);

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogClient = usePostHog();

  useEffect(() => {
    if (!pathname || !posthogClient) return;
    let url = window.location.origin + pathname;
    const q = searchParams?.toString();
    if (q) url += `?${q}`;
    posthogClient.capture("$pageview", {
      $current_url: url,
    });
  }, [pathname, searchParams, posthogClient]);

  return null;
}

function PostHogPrivyIdentify() {
  const posthogClient = usePostHog();
  const { ready, authenticated, user } = usePrivy();

  useEffect(() => {
    if (!posthogClient) return;
    if (!ready) return;

    if (authenticated && user?.id) {
      const email = user.email?.address;
      posthogClient.identify(user.id, {
        ...(email ? { email } : {}),
      });
    } else {
      posthogClient.reset();
    }
  }, [posthogClient, ready, authenticated, user?.id, user?.email?.address]);

  return null;
}

export function PostHogProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isPostHogConfigured) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogPrivyIdentify />
      {children}
    </PHProvider>
  );
}
