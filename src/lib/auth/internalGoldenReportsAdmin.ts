import type { NextRequest } from "next/server";

/**
 * Authenticates the RaptorX internal metrics dashboard (or other server) to
 * manage Golden Report projects. Set `INTERNAL_GOLDEN_REPORTS_ADMIN_SECRET` in
 * env and send the same value in header `x-raptorx-internal-admin-secret`.
 */
export function isInternalGoldenReportsAdmin(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_GOLDEN_REPORTS_ADMIN_SECRET?.trim();
  if (!expected) return false;
  const got = req.headers.get("x-raptorx-internal-admin-secret")?.trim();
  return !!got && got === expected;
}
