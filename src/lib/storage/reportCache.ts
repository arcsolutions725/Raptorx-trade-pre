/* eslint-disable @typescript-eslint/no-explicit-any */
const PREFIX = "rxcache";
const VERSION = 1; // bump if shape changes
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEnvelope<T> = {
  v: number; // schema version
  t: number; // timestamp saved
  ttl: number; // time-to-live
  data: T;
};

function k(...parts: string[]) {
  return [PREFIX, ...parts].join(":");
}

function now() {
  return Date.now();
}

function set<T>(key: string, data: T, ttl = DEFAULT_TTL_MS) {
  try {
    const env: CacheEnvelope<T> = { v: VERSION, t: now(), ttl, data };
    localStorage.setItem(key, JSON.stringify(env));
  } catch {}
}

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (env.v !== VERSION) return null; // different schema
    if (env.t + env.ttl < now()) return null; // expired
    return env.data;
  } catch {
    return null;
  }
}

export const ReportCache = {
  keys: {
    list(userId: string) {
      return k("reports", "list", userId);
    },
    report(userId: string, reportId: string) {
      return k("reports", "item", userId, reportId);
    },
  },

  setReports(userId: string, reports: any[], ttl?: number) {
    set(this.keys.list(userId), reports, ttl);
  },
  getReports(userId: string): any[] | null {
    return get<any[]>(this.keys.list(userId));
  },

  setReport(userId: string, reportId: string, report: any, ttl?: number) {
    set(this.keys.report(userId, reportId), report, ttl);
  },
  getReport(userId: string, reportId: string): any | null {
    return get<any>(this.keys.report(userId, reportId));
  },

  // Merge helper for messages (keeps cache fresh without refetch)
  upsertMessage(userId: string, reportId: string, message: any) {
    const key = this.keys.report(userId, reportId);
    const existing = this.getReport(userId, reportId);
    if (!existing) return;
    const conv = existing.conversation ?? { messages: [] };
    const msgs = Array.isArray(conv.messages) ? conv.messages.slice() : [];
    // Avoid duplicates
    const idx = msgs.findIndex((m: any) => m.id === message.id);
    if (idx >= 0) msgs[idx] = message;
    else msgs.push(message);

    const updated = {
      ...existing,
      conversation: { ...(existing.conversation || {}), messages: msgs },
    };
    set(key, updated);
  },
};
