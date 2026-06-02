import {
  getPredictFunBaseUrl,
  predictFunRequestHeaders,
} from "@/lib/predictfun/serverFetch";

/** GET/POST to Predict.fun with user JWT + server x-api-key. */
export async function predictFunFetchWithJwt(
  path: string,
  jwt: string,
  init?: RequestInit & { search?: URLSearchParams }
): Promise<Response> {
  const base = getPredictFunBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiPath = normalizedPath.startsWith("/v1/")
    ? normalizedPath
    : `/v1${normalizedPath}`;
  const q = init?.search?.toString();
  const url = q ? `${base}${apiPath}?${q}` : `${base}${apiPath}`;

  const headers = {
    ...predictFunRequestHeaders(),
    Accept: "application/json",
    Authorization: `Bearer ${jwt}`,
    ...(init?.headers as Record<string, string> | undefined),
  };

  const { search: _search, ...rest } = init ?? {};
  return fetch(url, {
    ...rest,
    headers,
    cache: "no-store",
  });
}

export async function predictFunGetJsonWithJwt<T = unknown>(
  path: string,
  jwt: string,
  search?: URLSearchParams
): Promise<{ ok: boolean; status: number; body: T | null; text: string }> {
  const res = await predictFunFetchWithJwt(path, jwt, { method: "GET", search });
  const text = await res.text();
  let body: T | null = null;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body, text };
}
