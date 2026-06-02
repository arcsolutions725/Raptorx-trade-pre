import type { OpenRouter } from "@openrouter/sdk";
import {
  fetchLimitlessMarketDocument,
  limitlessApiDocumentToRexMarketDetails,
  parseLimitlessSearchPayload,
} from "@/lib/limitless/marketDocument";
import { myriadFetchText } from "@/lib/myriad/serverFetch";
import { mapMyriadMarketDetailToMarketDetails } from "@/lib/myriad/mapMyriadMarketDetails";
import { normalizeKalshiEventTicker } from "@/lib/kalshi/normalizeEventTicker";
import { predictFunGetJson } from "@/lib/predictfun/serverFetch";
import { fetchPredictFunMarketDetailsById } from "@/lib/predictfun/fetchPredictFunMarketDetails";
import type { PredictFunApiMarket } from "@/lib/predictfun/mapPredictFunMarketRow";

type MarketToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

function safeJsonParse(input: string | undefined): any {
  if (!input) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

export type RexmarketsProvider =
  | "polymarket"
  | "kalshi"
  | "limitless"
  | "myriad"
  | "predictfun";

export function rexmarketsProviderToPathSegment(
  provider: RexmarketsProvider,
): string {
  return provider === "predictfun" ? "predict-fun" : provider;
}

export type RexmarketsEmbedPayload = {
  kind: "rexmarkets";
  provider: RexmarketsProvider;
  raptorxUrl?: string;
  marketDetails: any;
};

export function inferRexmarketsProviderFromText(text: string): RexmarketsProvider | undefined {
  const t = String(text || "");
  const hasKalshi =
    /https?:\/\/(?:www\.)?kalshi\.com\b/i.test(t) || /(^|\s)www\.kalshi\.com\b/i.test(t);
  const hasPolymarket =
    /https?:\/\/(?:www\.)?polymarket\.com\b/i.test(t) || /(^|\s)www\.polymarket\.com\b/i.test(t);
  const hasLimitless =
    /https?:\/\/(?:www\.)?limitless\.exchange\b/i.test(t) ||
    /(^|\s)www\.limitless\.exchange\b/i.test(t);
  const hasMyriad =
    /https?:\/\/(?:www\.)?myriad\.markets\b/i.test(t) ||
    /(^|\s)www\.myriad\.markets\b/i.test(t);
  const hasPredictFun =
    /https?:\/\/(?:www\.)?predict\.fun\b/i.test(t) ||
    /(^|\s)www\.predict\.fun\b/i.test(t) ||
    /\bpredict\s*fun\b/i.test(t);

  const n =
    (hasKalshi ? 1 : 0) +
    (hasPolymarket ? 1 : 0) +
    (hasLimitless ? 1 : 0) +
    (hasMyriad ? 1 : 0) +
    (hasPredictFun ? 1 : 0);
  if (n > 1) return undefined;
  if (hasKalshi) return "kalshi";
  if (hasPolymarket) return "polymarket";
  if (hasLimitless) return "limitless";
  if (hasMyriad) return "myriad";
  if (hasPredictFun) return "predictfun";
  return undefined;
}

function getBaseUrl(baseUrl?: string): string {
  return (baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://raptorx.trade").replace(
    /\/$/,
    ""
  );
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Fetch failed (${res.status}): ${t}`);
  }
  return await res.json();
}

function clampInt(n: any, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(Math.trunc(v), min), max);
}

function safeJsonArray(input: unknown): string[] {
  try {
    if (typeof input === "string") {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed.map((x) => String(x)) : [];
    }
    if (Array.isArray(input)) return input.map((x) => String(x));
    return [];
  } catch {
    return [];
  }
}

async function searchPolymarketDirect(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = clampInt(args?.limit ?? 5, 1, 10);
  if (!query) return { results: [] };

  const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}`;
  const data: any = await fetchJson(url);
  const events: any[] = Array.isArray(data?.events) ? data.events : [];
  const results = events.slice(0, limit).map((e: any) => ({
    id: e?.id ? String(e.id) : null,
    slug: e?.slug || null,
    ticker: e?.ticker || null,
    title: e?.title || "",
    subtitle: e?.description || e?.subtitle || "",
    volume24hr: e?.volume24hr || 0,
    liquidity: e?.liquidity || 0,
    active: e?.active ?? null,
    closed: e?.closed ?? null,
  }));

  return { results };
}

async function searchKalshiDirect(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = clampInt(args?.limit ?? 5, 1, 10);
  if (!query) return { results: [] };

  const baseUrl = "https://api.elections.kalshi.com/v1/search/series";
  const params = new URLSearchParams({
    order_by: "querymatch",
    status: "open,unopened",
    page_size: String(limit),
    with_milestones: "true",
    query,
    fuzzy_threshold: "4",
  });

  const url = `${baseUrl}?${params.toString()}`;
  const data: any = await fetchJson(url);
  const seriesList: any[] = Array.isArray(data?.current_page) ? data.current_page : [];

  const results = seriesList.slice(0, limit).map((s: any) => ({
    event_ticker: s?.event_ticker || s?.ticker || null,
    series_ticker: s?.series_ticker || null,
    title: s?.event_title || s?.series_title || "",
    subtitle: s?.event_subtitle || "",
    category: s?.category || "",
    total_volume: s?.total_volume || 0,
  }));

  return { results };
}

async function getPolymarketDetailsDirect(args: { slug?: string; event_id?: string; event_ticker?: string }) {
  const slug = (args?.slug || "").trim();
  const eventId = (args?.event_id || "").trim();
  const eventTicker = (args?.event_ticker || "").trim();
  if (!slug && !eventId && !eventTicker) return { error: "slug or event_id or event_ticker required" };

  let event: any = null;
  if (slug) {
    event = await fetchJson(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`);
  } else if (eventId) {
    event = await fetchJson(`https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`);
  } else {
    // Best-effort: try slug endpoint with ticker (often works) to avoid deep pagination.
    event = await fetchJson(`https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(eventTicker)}`);
  }

  const marketsArray: any[] = Array.isArray(event?.markets) ? event.markets : [];
  const transformedMarkets = marketsArray.map((market: any) => {
    const outcomes = safeJsonArray(market?.outcomes);
    const outcomePrices = safeJsonArray(market?.outcomePrices);

    // Polymarket gamma API returns bestBid/bestAsk in 0-1 range
    const bestBidRaw = Number(market?.bestBid ?? 0) || 0;
    const bestAskRaw = Number(market?.bestAsk ?? 0) || 0;
    // Convert to cents (0-100) for Bid/Ask Depth display
    const yesBidCents = bestBidRaw <= 1 ? bestBidRaw * 100 : bestBidRaw;
    const yesAskCents = bestAskRaw <= 1 ? bestAskRaw * 100 : bestAskRaw;

    // outcomePrices[0]=Yes, outcomePrices[1]=No (0..1)
    let yesPrice: number;
    let noPrice: number;

    if (outcomePrices.length >= 2) {
      const parsedYes = Number(outcomePrices[0]);
      const parsedNo = Number(outcomePrices[1]);
      if (Number.isFinite(parsedYes) && Number.isFinite(parsedNo) && parsedYes >= 0 && parsedNo >= 0) {
        yesPrice = parsedYes;
        noPrice = parsedNo;
      } else if (Number.isFinite(parsedYes) && parsedYes >= 0 && parsedYes <= 1) {
        yesPrice = parsedYes;
        noPrice = 1 - yesPrice;
      } else if (bestBidRaw > 0 && bestAskRaw > 0) {
        yesPrice = (bestBidRaw + bestAskRaw) / 2;
        noPrice = 1 - yesPrice;
      } else {
        yesPrice = Number(market?.lastTradePrice ?? 0) || 0;
        noPrice = 1 - yesPrice;
      }
    } else if (outcomePrices.length === 1) {
      const parsedYes = Number(outcomePrices[0]);
      if (Number.isFinite(parsedYes) && parsedYes >= 0 && parsedYes <= 1) {
        yesPrice = parsedYes;
        noPrice = 1 - yesPrice;
      } else if (bestBidRaw > 0 && bestAskRaw > 0) {
        yesPrice = (bestBidRaw + bestAskRaw) / 2;
        noPrice = 1 - yesPrice;
      } else {
        yesPrice = Number(market?.lastTradePrice ?? 0) || 0;
        noPrice = 1 - yesPrice;
      }
    } else if (bestBidRaw > 0 && bestAskRaw > 0) {
      yesPrice = (bestBidRaw + bestAskRaw) / 2;
      noPrice = 1 - yesPrice;
    } else {
      yesPrice = Number(market?.lastTradePrice ?? 0) || 0;
      noPrice = 1 - yesPrice;
    }

    const volume = Number(market?.volumeNum ?? market?.volume ?? 0) || 0;
    const volume24hr = Number(market?.volume24hr ?? 0) || 0;
    const liquidity = Number(market?.liquidityNum ?? market?.liquidity ?? 0) || 0;

    const conditionId = market?.conditionId || market?.condition_id || market?.id || "";
    const clobTokenIds = safeJsonArray(market?.clobTokenIds);
    const clobTokenId = clobTokenIds.length > 0 ? clobTokenIds[0] : undefined;
    const clobNoTokenId = clobTokenIds.length > 1 ? clobTokenIds[1] : undefined;
    const marketId = market?.id || market?.marketId || market?.market_id || conditionId;

    const title = market?.question || market?.groupItemTitle || outcomes[0] || "";

    return {
      ticker: conditionId,
      condition_id: conditionId,
      clob_token_id: clobTokenId,
      clob_no_token_id: clobNoTokenId,
      market_id: marketId,
      subtitle: title,
      groupItemTitle: title,
      probability: yesPrice,
      yes_price: yesPrice,
      no_price: noPrice,
      volume,
      volume_24h: volume24hr,
      yes_bid: yesBidCents,
      yes_ask: yesAskCents,
      liquidity,
      open_interest: Number(market?.openInterest ?? 0) || 0,
      status: market?.closed ? "closed" : market?.active ? "open" : "unopened",
      result: market?.resolvedBy ? "resolved" : undefined,
      open_time: market?.startDate || market?.startDateIso || null,
      close_time: market?.endDate || market?.endDateIso || null,
      expected_expiration_time: market?.endDate || market?.endDateIso || null,
    };
  });

  const totalVolume = transformedMarkets.reduce((sum: number, m: any) => sum + (Number(m?.volume) || 0), 0);
  const totalSeriesVolume = Number(event?.volume ?? 0) || totalVolume;
  const symbolImageUrl = event?.image || event?.icon || "";
  const seriesId = Array.isArray(event?.series) && event.series.length > 0 ? event.series[0]?.id : null;

  return {
    series_ticker: event?.ticker || eventTicker || event?.id,
    title: event?.title || "",
    subtitle: event?.description || "",
    category: event?.tags?.[0]?.slug || "",
    markets: transformedMarkets,
    total_volume: totalVolume,
    total_series_volume: totalSeriesVolume,
    symbol_image_url: symbolImageUrl,
    open_time: event?.startDate || null,
    close_time: event?.endDate || null,
    expected_expiration_time: event?.endDate || null,
    ticker: event?.ticker || eventTicker || event?.id,
    slug: event?.slug || null,
    event_id: event?.id ? String(event.id) : eventId || null,
    series_id: seriesId ? String(seriesId) : null,
  };
}

/** Kalshi fixed-point strings (e.g. volume_fp); keep in sync with /api/kalshi/market-details. */
function parseKalshiFp(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(typeof value === "string" ? String(value).trim() : value);
  return Number.isFinite(n) ? n : 0;
}

async function getKalshiDetailsDirect(args: { event_ticker: string }) {
  const eventTicker = normalizeKalshiEventTicker(args?.event_ticker);
  if (!eventTicker) return { error: "event_ticker required" };

  const eventsUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker)}`;
  const metadataUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker)}/metadata`;

  const [eventsRes, metaRes] = await Promise.all([
    fetch(eventsUrl, { method: "GET", headers: { "Content-Type": "application/json" }, cache: "no-store" }),
    fetch(metadataUrl, { method: "GET", headers: { "Content-Type": "application/json" }, cache: "no-store" }).catch(
      () => null
    ),
  ]);

  if (!eventsRes.ok) {
    const t = await eventsRes.text().catch(() => "");
    return { error: `Kalshi event fetch failed (${eventsRes.status})`, details: t };
  }

  const eventsData: any = await eventsRes.json();
  let imageUrl: string | undefined;
  if (metaRes && metaRes.ok) {
    try {
      const metaData: any = await metaRes.json();
      imageUrl = metaData?.image_url;
    } catch {
      // ignore
    }
  }

  const event = eventsData?.event || {};
  const allMarkets: any[] = Array.isArray(eventsData?.markets) ? eventsData.markets : [];
  const markets = allMarkets.filter((m: any) => (m.status || "").toLowerCase() === "active");

  const transformedMarkets = markets.map((market: any, index: number) => {
    const lastPriceDollarsStr = market.last_price_dollars;
    const lastPriceCents = Number(market.last_price) || 0;
    const lastPriceDollars =
      lastPriceDollarsStr != null ? parseKalshiFp(lastPriceDollarsStr) : lastPriceCents / 100;

    const yesPrice = lastPriceDollars || 0;
    const noPrice = yesPrice > 0 ? Number((1 - yesPrice).toFixed(4)) : 0;
    const probability = yesPrice;

    const yesBidDollars = parseKalshiFp(market.yes_bid_dollars);
    const yesAskDollars = parseKalshiFp(market.yes_ask_dollars);
    const yesBid = yesBidDollars > 0 ? yesBidDollars * 100 : Number(market.yes_bid) || 0;
    const yesAsk = yesAskDollars > 0 ? yesAskDollars * 100 : Number(market.yes_ask) || 0;

    const candidateName =
      market?.custom_strike?.Candidate ||
      market?.custom_strike?.candidate ||
      market?.subtitle ||
      market?.yes_sub_title ||
      market?.no_sub_title ||
      market?.title ||
      `Outcome ${index + 1}`;

    const marketId =
      market.market_id ?? market.id ?? market.market_ticker ?? market.ticker ?? null;

    const volumeFp = parseKalshiFp(market.volume_fp) || Number(market.volume) || 0;
    const volume24hFp =
      parseKalshiFp(market.volume_24h_fp) || Number(market.volume_24h) || volumeFp;
    const liquidityDollars =
      parseKalshiFp(market.liquidity_dollars) || Number(market.liquidity) || 0;
    const openInterestFp =
      parseKalshiFp(market.open_interest_fp) || Number(market.open_interest) || 0;

    return {
      ticker: market?.ticker || `market-${index}`,
      market_id: marketId,
      subtitle: candidateName,
      probability,
      yes_price: yesPrice,
      no_price: noPrice,
      volume: volumeFp,
      volume_24h: volume24hFp,
      yes_bid: yesBid,
      yes_ask: yesAsk,
      liquidity: liquidityDollars,
      open_interest: openInterestFp,
      status: market?.status || "open",
      result: market?.result || null,
      open_time: market?.open_ts || null,
      close_time: market?.close_ts || null,
      expected_expiration_time: market?.expected_expiration_ts || market?.close_ts || null,
    };
  });

  const totalVolume = transformedMarkets.reduce((sum: number, m: any) => sum + (Number(m?.volume) || 0), 0);
  const totalSeriesVolume = transformedMarkets.reduce((sum: number, m: any) => sum + (Number(m?.volume_24h) || 0), 0);

  const eventOpenTime = event?.open_ts || markets[0]?.open_ts || null;
  const eventCloseTime = event?.close_ts || markets[0]?.close_ts || null;
  const eventExpirationTime =
    event?.expected_expiration_ts || markets[0]?.expected_expiration_ts || markets[0]?.close_ts || null;

  const symbolImageUrl =
    imageUrl ||
    `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${encodeURIComponent(
      event?.series_ticker || eventTicker
    )}.webp?size=sm`;

  return {
    series_ticker: event?.series_ticker || eventTicker,
    title: event?.title || "",
    subtitle: event?.sub_title || "",
    category: event?.category || "",
    markets: transformedMarkets,
    total_volume: totalVolume,
    total_series_volume: totalSeriesVolume,
    symbol_image_url: symbolImageUrl,
    open_time: eventOpenTime,
    close_time: eventCloseTime,
    expected_expiration_time: eventExpirationTime,
    event_ticker: event?.event_ticker || eventTicker,
    ranged_group_name: event?.series_title || event?.title || "",
  };
}

function isLimitlessMarketExpired(m: any): boolean {
  if (m?.expired === true) return true;
  const s = (m?.status ?? "").toString().toUpperCase();
  return s === "CLOSED" || s === "RESOLVED" || s === "ARCHIVED";
}

async function searchLimitlessDirect(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = clampInt(args?.limit ?? 5, 1, 10);
  if (!query) return { results: [] };

  const params = new URLSearchParams({
    page: "1",
    limit: String(Math.min(Math.max(limit * 4, 10), 40)),
    query,
  });
  const url = `https://api.limitless.exchange/markets/search?${params}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return { results: [] };
  const data: any = await res.json();
  const list: any[] = parseLimitlessSearchPayload(data);
  const results = list
    .filter((m) => m && !isLimitlessMarketExpired(m))
    .slice(0, limit)
    .map((m: any) => ({
      slug: String(m.slug || m.id || "").trim(),
      title: m.title || "",
    }))
    .filter((r) => r.slug);
  return { results };
}

async function searchLimitlessViaRaptorx(args: { query: string; limit?: number }) {
  return await searchLimitlessDirect({ query: args?.query || "", limit: args?.limit });
}

async function getLimitlessDetailsDirect(args: { slug: string }) {
  const slug = String(args?.slug || "").trim();
  if (!slug) return { error: "slug required" };
  try {
    const doc = await fetchLimitlessMarketDocument(slug);
    return limitlessApiDocumentToRexMarketDetails(doc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: "Limitless fetch failed", details: msg };
  }
}

async function searchMyriadDirect(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = clampInt(args?.limit ?? 5, 1, 10);
  if (!query) return { results: [] };

  const params = new URLSearchParams({
    page: "1",
    limit: String(Math.min(Math.max(limit * 4, 10), 40)),
    sort: "volume_24h",
    order: "desc",
    state: "open",
    trading_model: "all",
    keyword: query,
  });
  try {
    const res = await myriadFetchText("/markets", params);
    if (!res.ok) return { results: [] };
    const data: any = await res.json();
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    const results = list
      .slice(0, limit)
      .map((m: any) => ({
        slug: String(m?.slug ?? "").trim(),
        title: m?.title || "",
      }))
      .filter((r) => r.slug);
    return { results };
  } catch {
    return { results: [] };
  }
}

async function getMyriadDetailsDirect(args: { slug: string }) {
  const slug = String(args?.slug || "").trim();
  if (!slug) return { error: "slug required" };
  try {
    const res = await myriadFetchText(
      `/markets/${encodeURIComponent(slug)}`,
      new URLSearchParams({ trading_model: "all" })
    );
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        detail = j.detail || j.message || j.error || detail;
      } catch {
        /* */
      }
      return { error: `Myriad fetch failed (${res.status})`, details: detail };
    }
    const raw = JSON.parse(text);
    return mapMyriadMarketDetailToMarketDetails(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: "Myriad fetch failed", details: msg };
  }
}

function predictFunMarketsFromSearchBody(body: unknown): PredictFunApiMarket[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data as PredictFunApiMarket[];
  if (data && typeof data === "object") {
    const markets = (data as { markets?: unknown }).markets;
    if (Array.isArray(markets)) return markets as PredictFunApiMarket[];
  }
  return [];
}

function resolvePredictFunMarketBySlug(
  markets: PredictFunApiMarket[],
  slug: string,
): PredictFunApiMarket | null {
  const want = slug.toLowerCase();
  return (
    markets.find((m) => String(m.categorySlug ?? "").toLowerCase() === want) ??
    markets.find((m) => String(m.id ?? "").toLowerCase() === want) ??
    null
  );
}

async function searchPredictFunDirect(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = clampInt(args?.limit ?? 5, 1, 10);
  if (!query) return { results: [] };

  const params = new URLSearchParams({
    query,
    limit: String(Math.min(Math.max(limit * 4, 10), 25)),
    includeStats: "true",
    includeResolved: "false",
  });
  try {
    const { ok, body } = await predictFunGetJson("/search", params);
    const markets = ok ? predictFunMarketsFromSearchBody(body) : [];
    const results = markets
      .slice(0, limit)
      .map((m) => ({
        id: String(m.id ?? "").trim(),
        slug: String(m.categorySlug ?? m.id ?? "").trim(),
        title: m.title || m.question || "",
      }))
      .filter((r) => r.id);
    return { results };
  } catch {
    return { results: [] };
  }
}

async function getPredictFunDetailsDirect(args: { id: string }) {
  const id = String(args?.id || "").trim();
  if (!id) return { error: "id required" };

  const primary = await fetchPredictFunMarketDetailsById(id);
  if (!("error" in primary)) return primary;

  try {
    const search = await searchPredictFunDirect({ query: id, limit: 10 });
    const top = Array.isArray(search?.results) ? search.results[0] : null;
    const resolvedId = String(top?.id ?? top?.slug ?? "").trim();
    if (resolvedId && resolvedId !== id) {
      const retry = await fetchPredictFunMarketDetailsById(resolvedId);
      if (!("error" in retry)) return retry;
    }

    const searchBody = await predictFunGetJson("/search", new URLSearchParams({
      query: id,
      limit: "15",
      includeStats: "true",
    }));
    const match = resolvePredictFunMarketBySlug(
      predictFunMarketsFromSearchBody(searchBody.body),
      id,
    );
    const matchId = match?.id != null ? String(match.id) : "";
    if (matchId && matchId !== id) {
      const retry = await fetchPredictFunMarketDetailsById(matchId);
      if (!("error" in retry)) return retry;
    }

    return { error: primary.error, details: primary.details };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: "Predict.fun fetch failed", details: msg };
  }
}

export function extractRexmarketsLink(
  text: string
): { provider: RexmarketsProvider; id: string; url: string } | null {
  // Matches:
  // - https://www.raptorx.trade/rexmarkets/polymarket/<slug>
  // - https://raptorx.trade/rexmarkets/polymarket/<slug>
  // - https://dev.raptorx.trade/rexmarkets/polymarket/<slug>
  // - (optionally) kalshi variant if/when it exists
  // Allow query params / trailing punctuation after the slug, but don't include them in the id.
  const m = text.match(
    /https?:\/\/(?:[a-z0-9-]+\.)?raptorx\.trade\/rexmarkets\/(polymarket|kalshi|limitless|myriad|predict-fun)\/([^\s/?#.,;:!)+]+)/i
  );
  if (!m) return null;
  const provider = (
    m[1].toLowerCase() === "predict-fun" ? "predictfun" : m[1].toLowerCase()
  ) as RexmarketsProvider;
  const rawId = m[2];
  const id = provider === "kalshi" ? normalizeKalshiEventTicker(rawId) : rawId;
  if (provider === "kalshi" && !id) return null;
  const url = m[0];
  return { provider, id, url };
}

/**
 * Extract a direct Polymarket, Kalshi, or Limitless market link from user text.
 * When the user pastes polymarket.com/event/<slug>, kalshi.com/markets/..., or
 * limitless.exchange/markets/<slug> we use the extracted id to fetch that market directly.
 */
export function extractDirectMarketLink(
  text: string,
  baseUrl?: string
): { provider: RexmarketsProvider; id: string; url: string } | null {
  const trimmed = String(text || "").trim();
  // Polymarket: https://polymarket.com/event/<slug> or https://www.polymarket.com/event/<slug>
  const polyMatch = trimmed.match(
    /https?:\/\/(?:www\.)?polymarket\.com\/event\/([^\s/?#.,;:!)+]+)/i
  );
  if (polyMatch) {
    const id = polyMatch[1];
    const url = `${getBaseUrl(baseUrl)}/rexmarkets/polymarket/${encodeURIComponent(id)}`;
    return { provider: "polymarket", id, url };
  }
  // Kalshi: https://kalshi.com/markets/<ticker> or .../markets/<series>/<kebab>/<event_ticker>
  // Event ticker is the last path segment (API uses event_ticker).
  const kalshiMatch = trimmed.match(
    /https?:\/\/(?:www\.)?kalshi\.com\/markets\/(?:[^/]+\/)*([^\s/?#.,;:!)+]+)/i
  );
  if (kalshiMatch) {
    const id = normalizeKalshiEventTicker(kalshiMatch[1]);
    if (!id) return null;
    const url = `${getBaseUrl(baseUrl)}/rexmarkets/kalshi/${encodeURIComponent(id)}`;
    return { provider: "kalshi", id, url };
  }
  // Limitless: https://limitless.exchange/markets/<slug>
  const limMatch = trimmed.match(
    /https?:\/\/(?:www\.)?limitless\.exchange\/markets\/([^\s/?#.,;:!)+]+)/i
  );
  if (limMatch) {
    const id = limMatch[1];
    const url = `${getBaseUrl(baseUrl)}/rexmarkets/limitless/${encodeURIComponent(id)}`;
    return { provider: "limitless", id, url };
  }
  // Myriad: https://myriad.markets/markets/<slug>
  const myriadMatch = trimmed.match(
    /https?:\/\/(?:www\.)?myriad\.markets\/markets\/([^\s/?#.,;:!)+]+)/i
  );
  if (myriadMatch) {
    const id = myriadMatch[1];
    const url = `${getBaseUrl(baseUrl)}/rexmarkets/myriad/${encodeURIComponent(id)}`;
    return { provider: "myriad", id, url };
  }
  // Predict.fun: https://predict.fun/market/<slug>
  const predictFunMatch = trimmed.match(
    /https?:\/\/(?:www\.)?predict\.fun\/market\/([^\s/?#.,;:!)+]+)/i
  );
  if (predictFunMatch) {
    const id = predictFunMatch[1];
    const url = `${getBaseUrl(baseUrl)}/rexmarkets/predict-fun/${encodeURIComponent(id)}`;
    return { provider: "predictfun", id, url };
  }
  return null;
}

export async function fetchRexmarketsMarketDetails(params: {
  baseUrl?: string;
  provider: RexmarketsProvider;
  id: string;
}) {
  // NOTE: Do NOT fetch our own `/api/...` endpoints from the server in Vercel-protected
  // environments (e.g. dev deployments). Those endpoints can require Vercel auth cookies
  // and will 401 in server-side tool runs. Fetch upstream APIs directly instead.
  if (params.provider === "polymarket") {
    const id = String(params.id || "").trim();
    // The agent may pass either a slug or an event_id. If it looks like an integer, treat as event_id.
    if (/^\d+$/.test(id)) return await getPolymarketDetailsDirect({ event_id: id });
    return await getPolymarketDetailsDirect({ slug: id });
  }
  if (params.provider === "limitless") {
    return await getLimitlessDetailsDirect({ slug: String(params.id || "").trim() });
  }
  if (params.provider === "myriad") {
    return await getMyriadDetailsDirect({ slug: String(params.id || "").trim() });
  }
  if (params.provider === "predictfun") {
    return await getPredictFunDetailsDirect({ id: String(params.id || "").trim() });
  }
  return await getKalshiDetailsDirect({ event_ticker: params.id });
}

async function searchKalshiViaRaptorx(args: { baseUrl?: string; query: string; limit?: number }) {
  return await searchKalshiDirect({ query: args?.query || "", limit: args?.limit });
}

async function searchPolymarketViaRaptorx(args: { baseUrl?: string; query: string; limit?: number }) {
  return await searchPolymarketDirect({ query: args?.query || "", limit: args?.limit });
}

export async function findRexmarketsEmbedsForQuery(params: {
  baseUrl?: string;
  query: string;
  providers?: RexmarketsProvider[];
  limitPerProvider?: number;
}): Promise<RexmarketsEmbedPayload[]> {
  const query = (params.query || "").trim();
  if (!query) return [];

  const baseUrl = params.baseUrl;
  const providers =
    params.providers && params.providers.length > 0
      ? params.providers
      : (["polymarket", "kalshi"] as RexmarketsProvider[]);
  const limit = Math.min(Math.max(Number(params.limitPerProvider ?? 5), 1), 10);

  const embeds: RexmarketsEmbedPayload[] = [];

  // Polymarket (prefer slug)
  if (providers.includes("polymarket")) {
    try {
      const search = await searchPolymarketViaRaptorx({ baseUrl, query, limit });
      const top = Array.isArray(search?.results) ? search.results[0] : null;
      const slug = top?.slug || null;
      if (slug) {
        const details = await fetchRexmarketsMarketDetails({
          baseUrl,
          provider: "polymarket",
          id: slug,
        });
        embeds.push({
          kind: "rexmarkets",
          provider: "polymarket",
          raptorxUrl: `${getBaseUrl(baseUrl)}/rexmarkets/polymarket/${slug}`,
          marketDetails: details,
        });
      }
    } catch {
      // ignore
    }
  }

  // Kalshi (event_ticker)
  if (providers.includes("kalshi")) {
    try {
      const search = await searchKalshiViaRaptorx({ baseUrl, query, limit });
      const top = Array.isArray(search?.results) ? search.results[0] : null;
      const eventTicker = top?.event_ticker || null;
      if (eventTicker) {
        const details = await fetchRexmarketsMarketDetails({
          baseUrl,
          provider: "kalshi",
          id: eventTicker,
        });
        embeds.push({
          kind: "rexmarkets",
          provider: "kalshi",
          raptorxUrl: `${getBaseUrl(baseUrl)}/rexmarkets/kalshi/${eventTicker}`,
          marketDetails: details,
        });
      }
    } catch {
      // ignore
    }
  }

  // Limitless (slug)
  if (providers.includes("limitless")) {
    try {
      const search = await searchLimitlessDirect({ query, limit });
      const top = Array.isArray(search?.results) ? search.results[0] : null;
      const slug = top?.slug || null;
      if (slug) {
        const details = await fetchRexmarketsMarketDetails({
          baseUrl,
          provider: "limitless",
          id: slug,
        });
        embeds.push({
          kind: "rexmarkets",
          provider: "limitless",
          raptorxUrl: `${getBaseUrl(baseUrl)}/rexmarkets/limitless/${encodeURIComponent(slug)}`,
          marketDetails: details,
        });
      }
    } catch {
      // ignore
    }
  }

  // Myriad (slug)
  if (providers.includes("myriad")) {
    try {
      const search = await searchMyriadDirect({ query, limit });
      const top = Array.isArray(search?.results) ? search.results[0] : null;
      const slug = top?.slug || null;
      if (slug) {
        const details = await fetchRexmarketsMarketDetails({
          baseUrl,
          provider: "myriad",
          id: slug,
        });
        embeds.push({
          kind: "rexmarkets",
          provider: "myriad",
          raptorxUrl: `${getBaseUrl(baseUrl)}/rexmarkets/myriad/${encodeURIComponent(slug)}`,
          marketDetails: details,
        });
      }
    } catch {
      // ignore
    }
  }

  // Predict.fun (id or category slug)
  if (providers.includes("predictfun")) {
    try {
      const search = await searchPredictFunDirect({ query, limit });
      const top = Array.isArray(search?.results) ? search.results[0] : null;
      const marketId = top?.id || top?.slug || null;
      if (marketId) {
        const details = await fetchRexmarketsMarketDetails({
          baseUrl,
          provider: "predictfun",
          id: marketId,
        });
        const routeId =
          String((details as { id?: string })?.id ?? "").trim() || marketId;
        embeds.push({
          kind: "rexmarkets",
          provider: "predictfun",
          raptorxUrl: `${getBaseUrl(baseUrl)}/rexmarkets/predict-fun/${encodeURIComponent(routeId)}`,
          marketDetails: details,
        });
      }
    } catch {
      // ignore
    }
  }

  return embeds;
}

async function searchKalshiSeries(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = Math.min(Math.max(Number(args?.limit ?? 5), 1), 10);
  if (!query) return { results: [] };

  const baseUrl = "https://api.elections.kalshi.com/v1/search/series";
  const params = new URLSearchParams({
    order_by: "querymatch",
    status: "open,unopened",
    page_size: String(limit),
    with_milestones: "true",
    query,
    fuzzy_threshold: "4",
  });

  const url = `${baseUrl}?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: `Kalshi search failed (${res.status})`, details: t, results: [] };
  }
  const data: any = await res.json();
  const seriesList = Array.isArray(data.current_page) ? data.current_page : [];

  const results = seriesList.slice(0, limit).map((s: any) => ({
    event_ticker: s.event_ticker,
    series_ticker: s.series_ticker,
    title: s.event_title || s.series_title || "",
    subtitle: s.event_subtitle || "",
    category: s.category || "",
    total_volume: s.total_volume || 0,
    markets_count: s.total_market_count || (s.markets?.length ?? 0),
  }));

  return { results };
}

async function getKalshiEventDetails(args: { event_ticker: string }) {
  const eventTicker = normalizeKalshiEventTicker(args?.event_ticker);
  if (!eventTicker) return { error: "event_ticker required" };

  const eventsUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker)}`;
  const metadataUrl = `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker)}/metadata`;

  const [eventsRes, metaRes] = await Promise.all([
    fetch(eventsUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }),
    fetch(metadataUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }).catch(() => null),
  ]);

  if (!eventsRes.ok) {
    const t = await eventsRes.text();
    return { error: `Kalshi event fetch failed (${eventsRes.status})`, details: t };
  }

  const eventsData: any = await eventsRes.json();
  let image_url: string | undefined;
  if (metaRes && metaRes.ok) {
    try {
      const metaData: any = await metaRes.json();
      image_url = metaData?.image_url;
    } catch {
      // ignore
    }
  }

  const event = eventsData?.event || {};
  const markets: any[] = Array.isArray(eventsData?.markets) ? eventsData.markets : [];

  return {
    event: {
      event_ticker: event.event_ticker || eventTicker,
      series_ticker: event.series_ticker || "",
      title: event.title || "",
      subtitle: event.sub_title || "",
      category: event.category || "",
      open_ts: event.open_ts || null,
      close_ts: event.close_ts || null,
      expected_expiration_ts: event.expected_expiration_ts || null,
      image_url,
    },
    markets: markets.slice(0, 20).map((m: any) => ({
      ticker: m.ticker,
      title: m.title || "",
      subtitle: m.subtitle || m.yes_sub_title || "",
      yes_bid: m.yes_bid ?? null,
      yes_ask: m.yes_ask ?? null,
      last_price: m.last_price ?? null,
      volume: m.volume ?? null,
      volume_24h: m.volume_24h ?? null,
      liquidity: m.liquidity ?? null,
      open_interest: m.open_interest ?? null,
      status: m.status ?? null,
      result: m.result ?? null,
    })),
  };
}

async function searchPolymarketEvents(args: { query: string; limit?: number }) {
  const query = (args?.query || "").trim();
  const limit = Math.min(Math.max(Number(args?.limit ?? 5), 1), 10);
  if (!query) return { results: [] };

  const baseUrl = "https://gamma-api.polymarket.com/public-search";
  const params = new URLSearchParams({ q: query });
  const url = `${baseUrl}?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    return {
      error: `Polymarket search failed (${res.status})`,
      details: t,
      results: [],
    };
  }
  const data: any = await res.json();
  const events: any[] = Array.isArray(data?.events) ? data.events : [];

  const results = events.slice(0, limit).map((e: any) => ({
    id: e.id ? String(e.id) : null,
    slug: e.slug || null,
    ticker: e.ticker || null,
    title: e.title || "",
    volume24hr: e.volume24hr || 0,
    liquidity: e.liquidity || 0,
    active: e.active ?? null,
    closed: e.closed ?? null,
  }));

  return { results };
}

async function getPolymarketEventDetails(args: { slug?: string; event_id?: string }) {
  const slug = (args?.slug || "").trim();
  const eventId = (args?.event_id || "").trim();
  if (!slug && !eventId) return { error: "slug or event_id required" };

  const url = slug
    ? `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`
    : `https://gamma-api.polymarket.com/events/${encodeURIComponent(eventId)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    return { error: `Polymarket event fetch failed (${res.status})`, details: t };
  }
  const event: any = await res.json();

  const markets: any[] = Array.isArray(event?.markets) ? event.markets : [];
  const transformed = markets.slice(0, 20).map((m: any) => {
    let outcomePrices: string[] = [];
    try {
      outcomePrices =
        typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : Array.isArray(m.outcomePrices)
            ? m.outcomePrices
            : [];
    } catch {
      outcomePrices = [];
    }
    const yes =
      outcomePrices.length >= 1 ? Number(outcomePrices[0]) : Number(m.lastTradePrice ?? 0);
    const no =
      outcomePrices.length >= 2 ? Number(outcomePrices[1]) : Number.isFinite(yes) ? 1 - yes : null;

    let outcomes: string[] = [];
    try {
      outcomes =
        typeof m.outcomes === "string"
          ? JSON.parse(m.outcomes)
          : Array.isArray(m.outcomes)
            ? m.outcomes
            : [];
    } catch {
      outcomes = [];
    }

    const title = m.question || m.groupItemTitle || outcomes[0] || "";

    return {
      market_id: m.id ? String(m.id) : null,
      condition_id: m.conditionId || m.condition_id || null,
      title,
      yes_price: Number.isFinite(yes) ? yes : null,
      no_price: Number.isFinite(no) ? no : null,
      bestBid: m.bestBid ?? null,
      bestAsk: m.bestAsk ?? null,
      volume24hr: m.volume24hr ?? null,
      liquidity: m.liquidity ?? null,
      closed: m.closed ?? null,
      active: m.active ?? null,
    };
  });

  return {
    event: {
      id: event.id ? String(event.id) : null,
      slug: event.slug || null,
      ticker: event.ticker || null,
      title: event.title || "",
      description: event.description || "",
      image: event.image || event.icon || null,
      volume24hr: event.volume24hr || 0,
      liquidity: event.liquidity || 0,
      active: event.active ?? null,
      closed: event.closed ?? null,
      startDate: event.startDate || null,
      endDate: event.endDate || null,
    },
    markets: transformed,
  };
}

export async function runMarketToolAgent(
  openRouter: OpenRouter,
  model: string,
  question: string,
  baseUrl?: string,
  options?: { onlyProvider?: RexmarketsProvider }
) {
  const effectiveOnlyProvider = options?.onlyProvider ?? inferRexmarketsProviderFromText(question);

  const tools = [
    {
      type: "function",
      function: {
        name: "search_kalshi",
        description:
          "Search Kalshi series/events by a natural language query. Use for prediction market questions.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (1-10)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_kalshi_event",
        description:
          "Fetch Kalshi market details (RexMarkets format) by event_ticker.",
        parameters: {
          type: "object",
          properties: {
            event_ticker: { type: "string", description: "Kalshi event_ticker" },
          },
          required: ["event_ticker"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_polymarket",
        description:
          "Search Polymarket events by natural language query (public-search).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (1-10)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_polymarket_event",
        description:
          "Fetch Polymarket market details (RexMarkets format) by slug (preferred) or event_id.",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Polymarket event slug" },
            event_id: { type: "string", description: "Polymarket event id" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_limitless",
        description:
          "Search Limitless (limitless.exchange) markets by natural language (public search API).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (1-10)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_limitless_market",
        description:
          "Fetch Limitless market details (RexMarkets format) by slug from limitless.exchange/markets/<slug>.",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Limitless market slug" },
          },
          required: ["slug"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_myriad_markets",
        description:
          "Search Myriad (myriad.markets) open markets by natural language (Myriad GET /markets keyword search).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (1-10)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_myriad_market",
        description:
          "Fetch Myriad market details (RexMarkets format) by URL slug from myriad.markets/markets/<slug>.",
        parameters: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Myriad market slug" },
          },
          required: ["slug"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_predictfun_markets",
        description:
          "Search Predict.fun markets by natural language (predict.fun prediction markets on BNB).",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (1-10)" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_predictfun_market",
        description:
          "Fetch Predict.fun market details (RexMarkets format) by market id or URL slug from predict.fun/market/<slug>.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "Predict.fun market id or URL slug" },
          },
          required: ["id"],
        },
      },
    },
  ];

  const TOOL_PROVIDER: Record<string, RexmarketsProvider> = {
    search_kalshi: "kalshi",
    get_kalshi_event: "kalshi",
    search_polymarket: "polymarket",
    get_polymarket_event: "polymarket",
    search_limitless: "limitless",
    get_limitless_market: "limitless",
    search_myriad_markets: "myriad",
    get_myriad_market: "myriad",
    search_predictfun_markets: "predictfun",
    get_predictfun_market: "predictfun",
  };

  // If the user provided a provider-specific URL, do not even expose the other provider tools.
  const filteredTools =
    effectiveOnlyProvider ? tools.filter((t: any) => TOOL_PROVIDER[t?.function?.name] === effectiveOnlyProvider) : tools;

  const TOOL_MAPPING: Record<string, (args: any) => Promise<any>> = {
    search_kalshi: (args: any) => searchKalshiViaRaptorx({ ...args, baseUrl }),
    get_kalshi_event: (args: any) =>
      fetchRexmarketsMarketDetails({
        baseUrl,
        provider: "kalshi",
        id: String(args?.event_ticker || ""),
      }),
    search_polymarket: (args: any) =>
      searchPolymarketViaRaptorx({ ...args, baseUrl }),
    get_polymarket_event: (args: any) =>
      fetchRexmarketsMarketDetails({
        baseUrl,
        provider: "polymarket",
        id: String(args?.slug || args?.event_id || ""),
      }),
    search_limitless: (args: any) => searchLimitlessViaRaptorx({ ...args }),
    get_limitless_market: (args: any) =>
      fetchRexmarketsMarketDetails({
        baseUrl,
        provider: "limitless",
        id: String(args?.slug || ""),
      }),
    search_myriad_markets: (args: any) => searchMyriadDirect({ ...args }),
    get_myriad_market: (args: any) =>
      fetchRexmarketsMarketDetails({
        baseUrl,
        provider: "myriad",
        id: String(args?.slug || ""),
      }),
    search_predictfun_markets: (args: any) => searchPredictFunDirect({ ...args }),
    get_predictfun_market: (args: any) =>
      fetchRexmarketsMarketDetails({
        baseUrl,
        provider: "predictfun",
        id: String(args?.id || ""),
      }),
  };

  const system = `You are a routing agent for RaptorX Claw v5.
Decide whether the user question is a prediction-market / market question (including politics/economics events that could have Kalshi/Polymarket/Limitless/Myriad/Predict.fun markets).

Important provider constraint:
- If the user's message contains a kalshi.com link, ONLY use Kalshi tools and ONLY return the "kalshi" field.
- If the user's message contains a polymarket.com link, ONLY use Polymarket tools and ONLY return the "polymarket" field.
- If the user's message contains a limitless.exchange link, ONLY use Limitless tools and ONLY return the "limitless" field.
- If the user's message contains a myriad.markets link, ONLY use Myriad tools and ONLY return the "myriad" field.
- If the user's message contains a predict.fun link, ONLY use Predict.fun tools and ONLY return the "predictfun" field.

If it IS a market question:
- Call the relevant search tool(s) using the user's question as the query.
- If results are returned, pick the best match and call the corresponding details tool.
- Then respond with a single JSON object containing:
  - isMarketQuestion: true
  - kalshi?: { searchResults, selectedEvent, details? }
  - polymarket?: { searchResults, selectedEvent, details? }
  - limitless?: { searchResults, selectedEvent, details? }
  - myriad?: { searchResults, selectedEvent, details? }
  - predictfun?: { searchResults, selectedEvent, details? }

If it is NOT a market question:
- Do NOT call tools.
- Respond with: { "isMarketQuestion": false }

Be concise and do not include any prose outside the JSON.`;

  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: question },
  ];

  const maxIterations = 6;
  for (let i = 0; i < maxIterations; i++) {
    const resp: any = await openRouter.chat.send({
      model,
      messages,
      tools: filteredTools,
      stream: false,
      parallel_tool_calls: false,
    } as any);

    const assistantMsg = resp?.choices?.[0]?.message ?? resp?.message;
    if (assistantMsg) messages.push(assistantMsg);

    const toolCalls: MarketToolCall[] =
      assistantMsg?.tool_calls || assistantMsg?.toolCalls || [];

    if (!toolCalls || toolCalls.length === 0) {
      const content = assistantMsg?.content;
      if (typeof content === "string") return safeJsonParse(content);
      return {};
    }

    for (const call of toolCalls) {
      const toolName = call?.function?.name || "";
      const toolArgs = safeJsonParse(call?.function?.arguments);
      const fn = TOOL_MAPPING[toolName];

      let result: any;
      try {
        const isKalshiTool = toolName === "search_kalshi" || toolName === "get_kalshi_event";
        const isPolyTool =
          toolName === "search_polymarket" || toolName === "get_polymarket_event";
        const isLimTool =
          toolName === "search_limitless" || toolName === "get_limitless_market";
        const isMyriadTool =
          toolName === "search_myriad_markets" || toolName === "get_myriad_market";
        const isPredictFunTool =
          toolName === "search_predictfun_markets" ||
          toolName === "get_predictfun_market";
        // Enforce provider constraint if requested
        if (
          effectiveOnlyProvider === "polymarket" &&
          (isKalshiTool || isLimTool || isMyriadTool || isPredictFunTool)
        ) {
          result = { skipped: true, reason: "onlyProvider=polymarket" };
        } else if (
          effectiveOnlyProvider === "kalshi" &&
          (isPolyTool || isLimTool || isMyriadTool || isPredictFunTool)
        ) {
          result = { skipped: true, reason: "onlyProvider=kalshi" };
        } else if (
          effectiveOnlyProvider === "limitless" &&
          (isKalshiTool || isPolyTool || isMyriadTool || isPredictFunTool)
        ) {
          result = { skipped: true, reason: "onlyProvider=limitless" };
        } else if (
          effectiveOnlyProvider === "myriad" &&
          (isKalshiTool || isPolyTool || isLimTool || isPredictFunTool)
        ) {
          result = { skipped: true, reason: "onlyProvider=myriad" };
        } else if (
          effectiveOnlyProvider === "predictfun" &&
          (isKalshiTool || isPolyTool || isLimTool || isMyriadTool)
        ) {
          result = { skipped: true, reason: "onlyProvider=predictfun" };
        } else {
          result = fn ? await fn(toolArgs) : { error: `Unknown tool: ${toolName}` };
        }
      } catch (err) {
        result = {
          error: `Tool failed: ${toolName}`,
          details: err instanceof Error ? err.message : String(err),
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id || `call_${Date.now()}`,
        content: JSON.stringify(result),
      });
    }
  }

  return {};
}

export function getUsableRaptorXMarketData(agentOutput: any): any | null {
  if (!agentOutput || typeof agentOutput !== "object") return null;
  if (agentOutput.isMarketQuestion !== true) return null;

  const kalshi = agentOutput.kalshi ?? null;
  const polymarket = agentOutput.polymarket ?? null;
  const limitless = agentOutput.limitless ?? null;
  const myriad = agentOutput.myriad ?? null;
  const predictfun = agentOutput.predictfun ?? null;

  const kalshiSearch =
    (Array.isArray(kalshi?.searchResults) && kalshi.searchResults) ||
    (Array.isArray(kalshi?.results) && kalshi.results) ||
    [];
  const polySearch =
    (Array.isArray(polymarket?.searchResults) && polymarket.searchResults) ||
    (Array.isArray(polymarket?.results) && polymarket.results) ||
    [];
  const limitlessSearch =
    (Array.isArray(limitless?.searchResults) && limitless.searchResults) ||
    (Array.isArray(limitless?.results) && limitless.results) ||
    [];
  const myriadSearch =
    (Array.isArray(myriad?.searchResults) && myriad.searchResults) ||
    (Array.isArray(myriad?.results) && myriad.results) ||
    [];
  const predictfunSearch =
    (Array.isArray(predictfun?.searchResults) && predictfun.searchResults) ||
    (Array.isArray(predictfun?.results) && predictfun.results) ||
    [];

  const kalshiHas =
    (kalshi && typeof kalshi === "object" && !!kalshi.details) || kalshiSearch.length > 0;
  const polyHas =
    (polymarket && typeof polymarket === "object" && !!polymarket.details) ||
    polySearch.length > 0;
  const limitlessHas =
    (limitless && typeof limitless === "object" && !!limitless.details) ||
    limitlessSearch.length > 0;
  const myriadHas =
    (myriad && typeof myriad === "object" && !!myriad.details) || myriadSearch.length > 0;
  const predictfunHas =
    (predictfun && typeof predictfun === "object" && !!predictfun.details) ||
    predictfunSearch.length > 0;

  if (!kalshiHas && !polyHas && !limitlessHas && !myriadHas && !predictfunHas)
    return null;

  return {
    isMarketQuestion: true,
    ...(kalshiHas ? { kalshi } : {}),
    ...(polyHas ? { polymarket } : {}),
    ...(limitlessHas ? { limitless } : {}),
    ...(myriadHas ? { myriad } : {}),
    ...(predictfunHas ? { predictfun } : {}),
  };
}

export function buildRexmarketsEmbedsFromMarketData(
  agentOutput: any,
  originalRaptorxUrl?: string
): RexmarketsEmbedPayload[] {
  const usable = getUsableRaptorXMarketData(agentOutput);
  if (!usable) return [];

  const embeds: RexmarketsEmbedPayload[] = [];
  if (usable.polymarket?.details) {
    embeds.push({
      kind: "rexmarkets",
      provider: "polymarket",
      raptorxUrl: originalRaptorxUrl,
      marketDetails: usable.polymarket.details,
    });
  }
  if (usable.kalshi?.details) {
    embeds.push({
      kind: "rexmarkets",
      provider: "kalshi",
      raptorxUrl: originalRaptorxUrl,
      marketDetails: usable.kalshi.details,
    });
  }
  if (usable.limitless?.details) {
    embeds.push({
      kind: "rexmarkets",
      provider: "limitless",
      raptorxUrl: originalRaptorxUrl,
      marketDetails: usable.limitless.details,
    });
  }
  if (usable.myriad?.details) {
    embeds.push({
      kind: "rexmarkets",
      provider: "myriad",
      raptorxUrl: originalRaptorxUrl,
      marketDetails: usable.myriad.details,
    });
  }
  if (usable.predictfun?.details) {
    embeds.push({
      kind: "rexmarkets",
      provider: "predictfun",
      raptorxUrl: originalRaptorxUrl,
      marketDetails: usable.predictfun.details,
    });
  }

  return embeds;
}

// Top prediction markets tool (top N per platform: Polymarket, Limitless, Kalshi by volume)
export {
  isTopPredictionMarketsIntent,
  extractTopMarketsCategory,
  extractTopMarketsLimit,
  fetchTopPredictionMarkets,
  inferProviderFromTopMarketsQuery,
  buildTopMarketsSuggestMessage,
  type TopMarketCard,
  type TopMarketsEmbedPayload,
  type FetchTopMarketsOptions,
} from "./topPredictionMarkets";


