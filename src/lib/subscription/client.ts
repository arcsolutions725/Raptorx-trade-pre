/**
 * Client-safe subscription helpers. Do not import limits.ts or prisma here —
 * they are server-only and use Node's `global`, which is undefined in the browser.
 *
 * Use in catch blocks to detect subscription/limit errors from API (402 or limit codes).
 * When true, show the paywall modal instead of a generic error.
 */
export function isSubscriptionLimitError(err: unknown): boolean {
  if (err == null) return false;
  const e = err as { status?: number; code?: string };
  if (e.status === 402) return true;
  if (e.code === "FREE_LIMIT_REACHED" || e.code === "PAID_LIMIT_REACHED")
    return true;
  return false;
}
