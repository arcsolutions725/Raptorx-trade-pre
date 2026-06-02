import posthog from "posthog-js";

const apiKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (apiKey && apiHost) {
  posthog.init(apiKey, {
    api_host: apiHost,
    defaults: "2026-01-30",
    /** App Router: we send `$pageview` on route changes in `PostHogProvider`. */
    capture_pageview: false,
    person_profiles: "identified_only",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") {
        ph.debug();
      }
    },
  });
}
