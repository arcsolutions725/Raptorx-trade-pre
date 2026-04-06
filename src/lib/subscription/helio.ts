/**
 * Helio (MoonPay Commerce) API helpers for verifying RaptorX Pro payments.
 * @see https://docs.hel.io/reference/transactionscontroller_value-1
 */

const HELIO_BASE = process.env.HELIO_API_BASE_URL ?? "https://api.hel.io";
const PAYLINK_ID =
  process.env.HELIO_PAYLINK_ID ?? "69a4c1a4a5e4ee39951e0b1a";

export type HelioTransactionMeta = {
  id?: string;
  transactionStatus?: string;
  senderPK?: string;
  customerDetails?: Record<string, unknown>;
  [key: string]: unknown;
};

export type HelioTransaction = {
  id?: string;
  paylinkId?: string;
  meta?: HelioTransactionMeta;
  createdAt?: string;
  [key: string]: unknown;
};

/**
 * Fetch recent successful transactions for our RaptorX Pro pay link.
 * Used to verify a payment before activating subscription.
 *
 * Helio requires both apiKey (query) and Authorization: Bearer <secret> (header).
 * Env: HELIO_PUBLIC_API_KEY (apiKey), HELIO_SECRET_API_KEY (bearerToken).
 * @see https://docs.hel.io/reference/overview
 */
export async function getHelioTransactions(options: {
  apiKey: string;
  /** Secret API Key — required; send as Authorization: Bearer <secret> */
  bearerToken: string;
  from?: Date;
  to?: Date;
  senderPK?: string;
}): Promise<HelioTransaction[]> {
  const { apiKey, bearerToken, from, to, senderPK } = options;
  const params = new URLSearchParams();
  params.set("apiKey", apiKey);
  if (from) params.set("from", from.toISOString());
  if (to) params.set("to", to.toISOString());
  if (senderPK) params.set("senderPK", senderPK);

  const url = `${HELIO_BASE}/v1/transactions/${PAYLINK_ID}/transactions?${params.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helio API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  // API may return array directly or wrapped (e.g. { data: [...] })
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.data)) return data.data;
  return [];
}

/**
 * Find a transaction by id in the list (Helio list endpoint doesn't have get-by-id).
 * Matches top-level id, meta.id, or when transactionId is a short id that matches end of meta.id.
 */
export function findTransactionById(
  transactions: HelioTransaction[],
  transactionId: string
): HelioTransaction | undefined {
  const raw = transactionId.trim();
  const id = raw.toLowerCase();
  const exact = transactions.find((t) => {
    const tid = (t.meta?.id ?? t.id ?? "").toString();
    return (
      tid.toLowerCase() === id ||
      t.id === raw ||
      t.meta?.id === raw ||
      (typeof t.id === "string" && t.id.toLowerCase() === id) ||
      (typeof t.meta?.id === "string" && t.meta.id.toLowerCase() === id)
    );
  });
  if (exact) return exact;
  // Some clients send a short id (e.g. last 24 chars); match if meta.id or id ends with it
  if (id.length >= 12) {
    return transactions.find((t) => {
      const tid = (t.meta?.id ?? t.id ?? "").toString().toLowerCase();
      return tid === id || tid.endsWith(id) || tid.includes(id);
    });
  }
  return undefined;
}

/**
 * Check if a transaction is successful.
 */
export function isSuccessfulTransaction(t: HelioTransaction): boolean {
  const status = (t.meta?.transactionStatus ?? t.meta?.status ?? "").toString().toUpperCase();
  return status === "SUCCESS" || status === "COMPLETED" || status === "SUCCEEDED";
}

/**
 * Extract userId from transaction metadata (pay link URL metadata[userId] can appear in several places).
 */
export function getUserIdFromTransaction(t: HelioTransaction): string | null {
  const meta = t.meta ?? {};
  const details = (meta.customerDetails as Record<string, unknown>) ?? {};
  const content = (meta.content as Record<string, unknown>) ?? {};
  const paylink = (t.paylink as Record<string, unknown>) ?? {};
  const paylinkContent = (paylink.content as Record<string, unknown>) ?? {};
  let userId: string | null =
    (meta.userId as string) ??
    (details.userId as string) ??
    (content.userId as string) ??
    (paylinkContent.userId as string) ??
    (meta.metadata as Record<string, unknown>)?.userId as string ??
    null;
  if (typeof userId === "string" && userId.trim()) return userId.trim();
  // Helio sometimes puts custom data in customerDetails.additionalJSON (string or object)
  const additionalJson = details.additionalJSON;
  if (additionalJson != null) {
    try {
      const parsed =
        typeof additionalJson === "string"
          ? (JSON.parse(additionalJson) as Record<string, unknown>)
          : (additionalJson as Record<string, unknown>);
      const id = parsed?.userId as string;
      if (typeof id === "string" && id.trim()) return id.trim();
    } catch {
      // ignore
    }
  }
  return null;
}
