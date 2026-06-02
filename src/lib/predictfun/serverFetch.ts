/** Predict.fun REST API (BNB mainnet / testnet). @see https://api.predict.fun/docs */

export const PREDICT_FUN_MAINNET_BASE = "https://api.predict.fun";
export const PREDICT_FUN_TESTNET_BASE = "https://api-testnet.predict.fun";

/** GET /v1/categories — @see https://api.predict.fun/docs#?route=get-/categories */
/** Listing filter on predict.fun/markets and GET /categories */
export const PREDICT_FUN_CATEGORY_STATUS = "OPEN";
/** Default page size for GET /v1/categories (pagination `first`) */
export const PREDICT_FUN_CATEGORIES_PAGE_SIZE = 25;

export function applyPredictFunCategoryDefaults(params: URLSearchParams): void {
  if (!params.has("status")) params.set("status", PREDICT_FUN_CATEGORY_STATUS);
  if (!params.has("sort")) params.set("sort", "POPULAR");
}

/**
 * API host (no `/v1` suffix; paths are normalized to `/v1/...`).
 * Default to mainnet to match predict.fun/markets listing.
 * `PREDICT_FUN_API_BASE_URL` can still override (including testnet).
 */
export function getPredictFunBaseUrl(): string {
  const raw =
    process.env.PREDICT_FUN_API_BASE_URL?.trim() || PREDICT_FUN_MAINNET_BASE;
  // Strip trailing slash and any trailing /v1 suffix so paths like /v1/categories
  // are never doubled into /v1/v1/categories when the env already includes /v1.
  return raw.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function predictFunRequestHeaders(): HeadersInit {
  const key = process.env.PREDICT_FUN_API_KEY?.trim();
  const headers: HeadersInit = { Accept: "application/json" };
  if (key) {
    (headers as Record<string, string>)["x-api-key"] = key;
  }
  return headers;
}

export async function predictFunFetchText(
  path: string,
  search?: URLSearchParams
): Promise<Response> {
  const base = getPredictFunBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiPath = normalizedPath.startsWith("/v1/")
    ? normalizedPath
    : `/v1${normalizedPath}`;
  const q = search?.toString();
  const url = q ? `${base}${apiPath}?${q}` : `${base}${apiPath}`;
  return fetch(url, {
    method: "GET",
    headers: predictFunRequestHeaders(),
    cache: "no-store",
  });
}

export async function predictFunGetJson<T = unknown>(
  path: string,
  search?: URLSearchParams
): Promise<{ ok: boolean; status: number; body: T | null; text: string }> {
  const res = await predictFunFetchText(path, search);
  const text = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, text };
}
