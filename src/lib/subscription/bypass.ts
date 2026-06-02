/**
 * Full product access without CLAW_PRO / MoonPay subscription (admin / internal).
 *
 * Built-in bypass (no env): usernames Dev0000 and Admin0000 (case-insensitive).
 *
 * Optional env:
 * - SUBSCRIPTION_BYPASS_USERNAME: comma-separated usernames (case-insensitive).
 * - SUBSCRIPTION_BYPASS_EMAIL: comma-separated emails (case-insensitive). If omitted or
 *   empty, only the username list is checked (useful when the account email in DB may
 *   differ from your login email).
 *
 * When both env lists are non-empty, the user must match one entry from each list.
 */

/** Staff accounts: unlimited access; webhook renewals do not rewrite subscription rows. */
const BUILTIN_BYPASS_USERNAMES = new Set(["dev0000", "admin0000"]);

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function envBypassUsernames(): string[] {
  return parseList(process.env.SUBSCRIPTION_BYPASS_USERNAME ?? "");
}

function envBypassEmails(): string[] {
  return parseList(process.env.SUBSCRIPTION_BYPASS_EMAIL ?? "");
}

export function userHasSubscriptionBypass(user: {
  username: string;
  email?: string | null;
}): boolean {
  const uname = user.username.trim().toLowerCase();
  if (BUILTIN_BYPASS_USERNAMES.has(uname)) return true;

  const wantUsers = envBypassUsernames();
  const wantEmails = envBypassEmails();

  if (wantUsers.length === 0 && wantEmails.length === 0) return false;

  if (wantUsers.length > 0 && !wantUsers.includes(uname)) return false;

  if (wantEmails.length === 0) {
    return wantUsers.length > 0;
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  if (!email) return false;
  return wantEmails.includes(email);
}
