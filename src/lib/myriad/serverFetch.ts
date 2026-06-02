export const MYRIAD_DEFAULT_BASE = "https://api-v2.myriadprotocol.com";

export function getMyriadBaseUrl(): string {
  const raw = process.env.MYRIAD_API_BASE_URL?.trim() || MYRIAD_DEFAULT_BASE;
  return raw.replace(/\/+$/, "");
}

export function myriadRequestHeaders(): HeadersInit {
  const key = process.env.MYRIAD_API_KEY?.trim();
  const headers: HeadersInit = { Accept: "application/json" };
  if (key) {
    (headers as Record<string, string>)["x-api-key"] = key;
  }
  return headers;
}

export async function myriadFetchText(path: string, search?: URLSearchParams): Promise<Response> {
  const base = getMyriadBaseUrl();
  const q = search?.toString();
  const url = q ? `${base}${path}?${q}` : `${base}${path}`;
  return fetch(url, {
    method: "GET",
    headers: myriadRequestHeaders(),
    cache: "no-store",
  });
}

export async function myriadPostJson(path: string, body: unknown): Promise<Response> {
  const base = getMyriadBaseUrl();
  const headers = new Headers(myriadRequestHeaders());
  headers.set("Content-Type", "application/json");
  return fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
}
