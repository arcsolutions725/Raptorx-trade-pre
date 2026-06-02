/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Resolve Limitless markets by URL slug or stableSlug (e.g. btc-hourly-price).
 * Direct GET /markets/{slug} only works for the canonical slug; stableSlug must be resolved via search.
 * @see https://api.limitless.exchange/api-v1
 */

const LIMITLESS_ORIGIN = "https://api.limitless.exchange";

export function parseLimitlessSearchPayload(data: any): any[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.markets)) return data.markets;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

function slugMatch(a: string | undefined | null, b: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Find a group or single market in a search `markets` list (may include nested group.markets).
 */
export function findLimitlessMarketInSearchList(
  list: any[],
  pathSlug: string,
): { node: any; parentGroup?: any } | null {
  const q = String(pathSlug || "").trim();
  if (!q) return null;

  const tryMatch = (item: any): { node: any; parentGroup?: any } | null => {
    if (!item) return null;
    if (item.marketType === "group" && Array.isArray(item.markets)) {
      if (slugMatch(item.slug, q) || slugMatch(item.stableSlug, q)) {
        return { node: item };
      }
      for (const child of item.markets) {
        if (slugMatch(child.slug, q) || slugMatch(child.stableSlug, q)) {
          return { node: child, parentGroup: item };
        }
      }
    } else {
      if (slugMatch(item.slug, q) || slugMatch(item.stableSlug, q)) {
        return { node: item, parentGroup: undefined };
      }
    }
    return null;
  };

  for (const item of list) {
    const hit = tryMatch(item);
    if (hit) return hit;
  }

  return null;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Limitless ${res.status}: ${t}`);
  }
  return await res.json();
}

/**
 * Fetch full market JSON: try GET /markets/{slug}, then search + optional refetch by canonical slug.
 */
export async function fetchLimitlessMarketDocument(pathSlug: string): Promise<any> {
  const slug = String(pathSlug || "").trim();
  if (!slug) throw new Error("slug required");

  const directUrl = `${LIMITLESS_ORIGIN}/markets/${encodeURIComponent(slug)}`;
  const directRes = await fetch(directUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (directRes.ok) {
    return await directRes.json();
  }

  const searchParams = new URLSearchParams({
    page: "1",
    limit: "25",
    query: slug,
  });
  const searchUrl = `${LIMITLESS_ORIGIN}/markets/search?${searchParams}`;
  const searchRes = await fetch(searchUrl, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!searchRes.ok) {
    const t = await searchRes.text().catch(() => "");
    throw new Error(`Limitless search ${searchRes.status}: ${t}`);
  }

  const searchJson: any = await searchRes.json();
  const list = parseLimitlessSearchPayload(searchJson);
  const hit = findLimitlessMarketInSearchList(list, slug);
  if (!hit?.node) {
    throw new Error(`No Limitless market found for slug: ${slug}`);
  }

  const node = hit.node;
  if (node.marketType === "group" && Array.isArray(node.markets)) {
    return node;
  }

  const canonical = String(node.slug || "").trim();
  if (canonical && canonical !== slug) {
    const retryUrl = `${LIMITLESS_ORIGIN}/markets/${encodeURIComponent(canonical)}`;
    const retryRes = await fetch(retryUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (retryRes.ok) return await retryRes.json();
  }

  return node;
}

function stripHtml(input: string): string {
  return String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVolumeFields(data: any): number {
  let volumeNum = 0;
  const volumeFormattedRaw =
    data?.volumeFormatted != null && data.volumeFormatted !== ""
      ? String(data.volumeFormatted).trim()
      : "";
  if (volumeFormattedRaw) {
    const v = parseFloat(volumeFormattedRaw);
    if (Number.isFinite(v)) volumeNum = v;
  } else if (data?.volume != null) {
    const raw = data.volume;
    const v = typeof raw === "string" ? parseFloat(raw) : Number(raw);
    if (Number.isFinite(v)) volumeNum = v;
  }
  return volumeNum;
}

function liquidityNumber(data: any): number {
  const liq = data?.liquidity ?? data?.liquidityFormatted;
  if (liq == null) return 0;
  const n = typeof liq === "string" ? parseFloat(liq) : Number(liq);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize API prices to implied-yes fraction in [0,1] and no fraction */
function normalizeYesNoFractions(prices: unknown[]): { yes: number; no: number } | null {
  if (!Array.isArray(prices) || prices.length < 1) return null;
  const p0 = Number(prices[0]);
  const p1 = prices.length >= 2 ? Number(prices[1]) : NaN;
  if (!Number.isFinite(p0)) return null;
  let yes = p0;
  let no = Number.isFinite(p1) ? p1 : NaN;
  if (yes > 1 && yes <= 100) yes = yes / 100;
  if (Number.isFinite(no) && no > 1 && no <= 100) no = no / 100;
  if (!Number.isFinite(no)) no = 1 - yes;
  return { yes, no };
}

function outcomeRowFromChild(child: any): any | null {
  if (!child || isLimitlessExpired(child)) return null;
  const fr = normalizeYesNoFractions(child.prices || []);
  if (!fr) return null;
  const vol = parseVolumeFields(child);
  const liq = liquidityNumber(child);
  return {
    ticker: String(child.slug || child.id || ""),
    subtitle: String(child.title || "Outcome").trim(),
    title: String(child.title || "").trim(),
    probability: fr.yes,
    yes_price: fr.yes,
    no_price: fr.no,
    volume: vol,
    volume_24h: vol,
    yes_bid: 0,
    yes_ask: 0,
    liquidity: liq,
    status: String(child.status || "open").toLowerCase(),
  };
}

function isLimitlessExpired(m: any): boolean {
  if (m?.expired === true) return true;
  const s = (m?.status ?? "").toString().toUpperCase();
  return s === "CLOSED" || s === "RESOLVED" || s === "ARCHIVED";
}

/**
 * Map a Limitless API document (single or group) to RexMarkets / embed shape.
 */
export function limitlessApiDocumentToRexMarketDetails(data: any): any {
  const status = data.status || "";
  const active = status === "FUNDED" || status === "ACTIVE";
  const closed = status === "CLOSED" || status === "RESOLVED";
  const archived = status === "ARCHIVED";

  const categoryId = data.marketPageId ?? data.categoryId ?? data.category ?? null;
  const conditionId =
    data.conditionId ?? data.condition_id ?? data.condition ?? null;

  const venue = data.venue?.exchange
    ? { exchange: data.venue.exchange, adapter: data.venue.adapter ?? undefined }
    : null;
  const positionIds =
    data.tokens?.yes != null && data.tokens?.no != null
      ? [String(data.tokens.yes), String(data.tokens.no)]
      : Array.isArray(data.positionIds)
        ? data.positionIds.map(String)
        : null;

  const logo = data.logo ?? data.imageUrl ?? null;
  const descPlain = stripHtml(data.description || "");

  if (data.marketType === "group" && Array.isArray(data.markets)) {
    const rows = data.markets
      .map((c: any) => outcomeRowFromChild(c))
      .filter(Boolean) as any[];
    const totalVol = rows.reduce((s, r) => s + (Number(r.volume) || 0), 0);
    const slugOut = String(data.slug || "").trim();
    return {
      id: String(data.id || slugOut),
      ticker: slugOut,
      slug: slugOut,
      title: data.title || "",
      subtitle: data.tags?.[0] || "",
      description: descPlain,
      image: logo,
      icon: logo,
      active,
      closed,
      archived,
      volume: totalVol,
      volume24hr: totalVol,
      liquidity: 0,
      yesPrice: "—",
      noPrice: "—",
      markets: rows,
      tags: data.tags || [],
      symbol_image_url: data.imageUrl || data.logo || null,
      rawEventData: data,
      venue,
      positionIds,
      categoryId: categoryId != null ? String(categoryId) : null,
      conditionId: conditionId != null ? String(conditionId) : null,
      total_volume: totalVol,
      total_series_volume: totalVol,
    };
  }

  const prices = data.prices || [];
  const fr = normalizeYesNoFractions(prices);
  const volumeNum = parseVolumeFields(data);
  const liq = liquidityNumber(data);

  const yesPriceDisplay =
    prices[0] !== undefined
      ? (() => {
          const n = Number(prices[0]);
          const frac = Number.isFinite(n) && n > 1 && n <= 100 ? n / 100 : n;
          return Number.isFinite(frac) ? frac * 100 : "—";
        })()
      : "—";
  const noPriceDisplay =
    prices[1] !== undefined
      ? (() => {
          const n = Number(prices[1]);
          const frac = Number.isFinite(n) && n > 1 && n <= 100 ? n / 100 : n;
          return Number.isFinite(frac) ? frac * 100 : "—";
        })()
      : "—";

  const slugOut = String(data.slug || "").trim();
  const syntheticMarkets: any[] = [];
  if (fr) {
    syntheticMarkets.push({
      ticker: slugOut,
      subtitle: data.title || "Market",
      title: data.title || "",
      probability: fr.yes,
      yes_price: fr.yes,
      no_price: fr.no,
      volume: volumeNum,
      volume_24h: volumeNum,
      yes_bid: 0,
      yes_ask: 0,
      liquidity: liq,
      status: active ? "open" : "closed",
    });
  }

  return {
    id: String(data.id || slugOut),
    ticker: slugOut,
    slug: slugOut,
    title: data.title || "",
    subtitle: data.tags?.[0] || "",
    description: descPlain,
    image: logo,
    icon: logo,
    active,
    closed,
    archived,
    volume: volumeNum,
    volume24hr: volumeNum,
    liquidity: liq,
    yesPrice: yesPriceDisplay,
    noPrice: noPriceDisplay,
    markets: syntheticMarkets,
    tags: data.tags || [],
    symbol_image_url: logo,
    rawEventData: data,
    venue,
    positionIds,
    categoryId: categoryId != null ? String(categoryId) : null,
    conditionId: conditionId != null ? String(conditionId) : null,
    total_volume: volumeNum,
    total_series_volume: volumeNum,
  };
}
