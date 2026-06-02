/* eslint-disable @typescript-eslint/no-explicit-any */
import { utils } from "ethers";
import { extractPredictFunList } from "@/lib/predictfun/parsePredictFunModalApi";

/** Extract position rows from GET /v1/positions/{address} response shapes. */
export function extractPredictFunPositionsList(body: unknown): any[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];

  const fromRoot = extractPredictFunList(body);
  if (fromRoot.length > 0) return fromRoot;

  const b = body as Record<string, unknown>;
  const data = b.data;
  if (Array.isArray(data)) return data as any[];

  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.data)) return d.data as any[];
    if (Array.isArray(d.positions)) return d.positions as any[];
    if (Array.isArray(d.items)) return d.items as any[];
    if (Array.isArray(d.results)) return d.results as any[];
  }

  return [];
}

/** Parse share balance from a position object (wei or human-readable). */
export function predictFunPositionShares(raw: any): number {
  const candidates = [
    raw?.balance,
    raw?.amount,
    raw?.size,
    raw?.shares,
    raw?.quantity,
    raw?.sharesWei,
    raw?.shareAmount,
    raw?.tokenAmount,
    raw?.outcome?.balance,
    raw?.outcome?.amount,
  ];

  for (const v of candidates) {
    if (v == null) continue;
    if (typeof v === "number") {
      if (Number.isFinite(v) && v > 0) return v;
      continue;
    }
    const s = String(v).trim();
    if (!s) continue;
    try {
      if (/^\d+$/.test(s)) {
        const n = Number(utils.formatUnits(s, 18));
        if (n > 0) return n;
        continue;
      }
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* try next */
    }
  }
  return 0;
}

export function readPredictFunAccountAddressFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const data = b.data as Record<string, unknown> | undefined;
  const addr = String(
    data?.address ?? data?.predictAccount ?? data?.depositAddress ?? ""
  ).trim();
  return /^0x[a-fA-F0-9]{40}$/i.test(addr) ? addr : null;
}
