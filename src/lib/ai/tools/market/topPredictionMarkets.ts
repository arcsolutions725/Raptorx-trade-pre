/**
 * Top prediction markets tool for Claw v5.
 * When the user asks for "top prediction markets" (or "hottest", "best", etc.) we show top 3 Polymarket + top 3 Kalshi by volume.
 * Supports category-specific queries (e.g. "top sports markets") and filters out expired markets.
 */

/** Single source of category keywords for intent patterns (both noun and adjective forms). Used to build regex. */
const CATEGORY_REGEX =
  "sports|politics|political|crypto|finance|financial|economics|economy|economic|entertainment|culture|climate|weather|tech|technology|science|elections?|election|world|geopolitics|geopolitical|companies|earnings|health|transportation|trump|business|international|pop-culture|pop\\s*culture|financials|fed|inflation|rates|ai|artificial\\s*intelligence|space|energy|media|celebrity|music|film|movies";

export type TopMarketCard = {
  id: string;
  title: string;
  volume: number;
  volume24hr?: number;
  provider: "polymarket" | "kalshi";
  /** Market/event symbol image URL for the card. */
  imageUrl?: string;
};

export type TopMarketsEmbedPayload = {
  kind: "top_markets";
  polymarket: TopMarketCard[];
  kalshi: TopMarketCard[];
  /** When the requested category doesn't exist on the chosen platform, show this message above the cards. */
  message?: string;
  /** Available categories for the platform (e.g. when showing "no election category" fallback). */
  categoryList?: string[];
};

/**
 * Infer which provider the user wants when asking for top markets (e.g. "best sports on Kalshi" -> kalshi).
 * Use when marketMode is Auto. Only infer a single provider when the user explicitly mentions a platform
 * (e.g. "on Kalshi", "on Polymarket"); otherwise return undefined so we show both Polymarket and Kalshi.
 */
export function inferProviderFromTopMarketsQuery(text: string): "polymarket" | "kalshi" | undefined {
  const t = (text || "").toLowerCase();
  const mentionsKalshi = /\bkalshi\b/.test(t);
  const mentionsPolymarket = /\bpolymarket\b/.test(t);
  // If the query doesn't mention either platform, never restrict to one — show both (e.g. "Top Culture markets").
  if (!mentionsKalshi && !mentionsPolymarket) return undefined;
  // Prefer explicit "on Kalshi" / "on Polymarket" (or "in", "for")
  const onKalshi = /\b(?:on|in|for)\s+kalshi\b/.test(t) || /\bkalshi\s+(?:markets?|prediction|right\s+now)/.test(t);
  const onPolymarket = /\b(?:on|in|for)\s+polymarket\b/.test(t) || /\bpolymarket\s+(?:markets?|prediction|right\s+now)/.test(t);
  if (onKalshi && !onPolymarket) return "kalshi";
  if (onPolymarket && !onKalshi) return "polymarket";
  // "hot on Kalshi", "hottest on Kalshi", "best on Polymarket"
  if (/\b(?:hot|hottest|best)\s+(?:on|in)\s+kalshi\b/.test(t) || /\b(?:markets?|what)\s+.*\s+(?:on|in)\s+kalshi\b/.test(t)) return "kalshi";
  if (/\b(?:hot|hottest|best)\s+(?:on|in)\s+polymarket\b/.test(t) || /\b(?:markets?|what)\s+.*\s+(?:on|in)\s+polymarket\b/.test(t)) return "polymarket";
  // Standalone platform name at end or before "markets"
  if (/\bkalshi\s*\.?\s*$/i.test(text.trim()) || /\b(?:top|best|hottest)\s+.*\s+kalshi\b/i.test(t)) return "kalshi";
  if (/\bpolymarket\s*\.?\s*$/i.test(text.trim()) || /\b(?:top|best|hottest)\s+.*\s+polymarket\b/i.test(t)) return "polymarket";
  return undefined;
}

// Match any phrasing that asks for "top" or "hottest" markets (prediction/Kalshi/Polymarket).
const TOP_MARKETS_PATTERNS = [
  // "top N markets", "top prediction markets", "top 5 markets"
  /top\s*(?:\d+\s*)?(?:prediction\s*)?markets?/i,
  // "hottest markets", "hottest prediction markets", "top 5 hottest markets on Kalshi and Polymarket"
  /(?:top\s*(?:\d+\s*)?)?hottest\s*(?:prediction\s*)?markets?/i,
  /(?:hottest|best|most\s*active)\s*(?:\d+\s*)?(?:prediction\s*)?markets?(?:\s*(?:on|from)\s*(?:kalshi|polymarket))?/i,
  // "what are the top/hottest ...", "give me the top/hottest ..."
  /(?:what(?:'s| are)\s*)?(?:the\s*)?(?:top|hottest|best|most\s*traded|highest\s*volume)\s*(?:\d+\s*)?(?:prediction\s*)?markets?/i,
  /(?:give\s*me\s*)?(?:the\s*)?(?:top|hottest)\s*(?:\d+\s*)?(?:hottest\s*)?(?:prediction\s*)?markets?(?:\s*(?:on|from|in)\s*(?:kalshi|polymarket))?/i,
  // "markets right now", "prediction markets today", "high-volume X markets", "list of all X markets"
  /(?:prediction\s*)?markets?\s*(?:right\s*now|today|currently)/i,
  new RegExp(`(?:high-volume|high\\s*volume|list\\s+of\\s+(?:all\\s+)?)?(?:${CATEGORY_REGEX})\\s*markets?`, "i"),
  new RegExp(`(?:${CATEGORY_REGEX})\\s*markets?\\s*(?:today|right\\s*now|currently)?`, "i"),
  // "top/best Polymarket and Kalshi markets"
  /(?:top|best)\s*(?:polymarket|kalshi)\s*(?:and\s*)?(?:polymarket|kalshi)?\s*markets?/i,
  /(?:most\s*)?(?:active|traded)\s*(?:prediction\s*)?markets?/i,
  // Category-specific: "top sports/political/geopolitical/crypto/... markets" (single source: CATEGORY_REGEX)
  new RegExp(`(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})\\s*markets?`, "i"),
  new RegExp(`(?:what\\s*are\\s*)?(?:the\\s*)?(?:top|hottest)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})\\s*markets?(?:\\s*(?:right\\s*now|on\\s+(?:kalshi|polymarket)))?`, "i"),
  // "tell me about / show me / asked about the top X markets"
  new RegExp(`(?:tell\\s*me\\s*about|show\\s*me|asked\\s*about|about)\\s+(?:the\\s*)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})\\s*markets?`, "i"),
  new RegExp(`(?:give\\s*me|show\\s*me)\\s+(?:the\\s*)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})\\s*markets?`, "i"),
  // "best X markets on Kalshi/Polymarket" (X = any category word)
  /(?:top|hottest|best)\s*(?:\d+\s*)?\w+\s*markets?(?:\s*(?:on|from|in)\s*(?:kalshi|polymarket))/i,
  // "What is hot on Kalshi right now?" / "What's hot on Polymarket?" — show top markets for that platform only
  /what(?:'s|\s+is)\s+hot\s+(?:on|in)\s+(?:kalshi|polymarket)(?:\s+right\s+now)?/i,
  // "Which markets are (the) hottest/best on Kalshi?" / "Which markets in the hottest on Kalshi?"
  /which\s+markets?\s+(?:are\s+)?(?:in\s+the\s+)?(?:hot|hottest|best)\s+(?:on|in)\s+(?:kalshi|polymarket)/i,
  // "What are the hottest/best (markets) on Kalshi/Polymarket?"
  /what\s+are\s+(?:the\s+)?(?:hottest|best|hot)(?:\s+markets?)?\s+(?:on|in)\s+(?:kalshi|polymarket)/i,
  // "Top Markets in Climate & Weather", "Top markets in Politics", "Top Culture markets" (in X)
  new RegExp(`top\\s+markets?\\s+in\\s+[\\w\\s&]*(?:${CATEGORY_REGEX})`, "i"),
  // "list (me) the top/best/hottest X markets", "list political markets", "list the top 5"
  new RegExp(`list\\s+(?:me\\s+)?(?:the\\s+)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})?\\s*markets?`, "i"),
  /list\s+(?:me\s+)?(?:the\s+)?(?:top|hottest|best)\s*(?:\d+\s*)?(?:prediction\s*)?markets?/i,
  // "get (me) the top X markets", "find (me) the best X markets"
  new RegExp(`(?:get|find)\\s+(?:me\\s+)?(?:the\\s+)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})?\\s*markets?`, "i"),
  /(?:get|find)\s+(?:me\s+)?(?:the\s+)?(?:top|hottest|best)\s*(?:\d+\s*)?(?:prediction\s*)?markets?/i,
  // "can you show/give/list me the top X markets"
  new RegExp(`can\\s+you\\s+(?:show|give|list|find|get)\\s+(?:me\\s+)?(?:the\\s+)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})?\\s*markets?`, "i"),
  /can\s+you\s+(?:show|give|list)\s+(?:me\s+)?(?:the\s+)?(?:top|hottest|best)\s*(?:\d+\s*)?(?:prediction\s*)?markets?/i,
  // "I want (to see) the top X markets", "I'd like the top X markets"
  new RegExp(`I\\s*(?:'d|would)?\\s*(?:want|like)\\s+(?:to\\s+see\\s+)?(?:the\\s+)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})?\\s*markets?`, "i"),
  // "recommend (me) the top X markets", "suggest the top X markets"
  new RegExp(`(?:recommend|suggest)\\s+(?:me\\s+)?(?:the\\s+)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})?\\s*markets?`, "i"),
  /(?:recommend|suggest)\s+(?:me\s+)?(?:the\s+)?(?:top|hottest|best)\s*(?:\d+\s*)?(?:prediction\s*)?markets?/i,
  // "display the top X markets", "browse top X markets", "see the top X markets"
  new RegExp(`(?:display|browse|see)\\s+(?:the\\s+)?(?:top|hottest|best)\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})?\\s*markets?`, "i"),
  // "what's hot (right now)" without platform — show top markets
  /what(?:'s|\s+is)\s+hot(?:\s+right\s+now)?/i,
  // "any (good) top X markets", "any political/geopolitical markets"
  new RegExp(`any\\s+(?:good\\s+)?(?:top|hottest|best)?\\s*(?:\\d+\\s*)?(?:${CATEGORY_REGEX})\\s*markets?`, "i"),
];

/** Polymarket gamma API tag_slug by category. Aligned with /api/polymarket/categories. */
const POLY_TAG_BY_CATEGORY: Record<string, string> = {
  sports: "sports",
  politics: "politics",
  political: "politics",
  crypto: "crypto",
  finance: "finance",
  financial: "finance",
  financials: "finance",
  economics: "economy",
  economy: "economy",
  economic: "economy",
  entertainment: "pop-culture",
  culture: "pop-culture",
  tech: "tech",
  technology: "tech",
  science: "tech",
  climate: "climate",
  weather: "climate",
  elections: "elections",
  election: "elections",
  world: "world",
  geopolitics: "geopolitics",
  geopolitical: "geopolitics",
  international: "geopolitics",
  companies: "earnings",
  earnings: "earnings",
  business: "earnings",
  trump: "trump",
  inflation: "economy",
  fed: "economy",
  rates: "finance",
  ai: "tech",
  media: "pop-culture",
  celebrity: "pop-culture",
  music: "pop-culture",
  film: "pop-culture",
  movies: "pop-culture",
  energy: "climate",
  space: "world",
  // health, transportation: not in Polymarket tag API; omit so we fetch top markets without tag filter
};

export function isTopPredictionMarketsIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return TOP_MARKETS_PATTERNS.some((re) => re.test(t));
}

/**
 * Extract category from query for category-specific top markets (e.g. "top sports markets" -> "sports", "best election markets" -> "elections").
 * Also supports "crypto markets today", "high-volume crypto markets", "list of all X markets" so that when the user asks for a specific
 * market type (crypto, sports, etc.), we only return those markets.
 */
export function extractTopMarketsCategory(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  // Longer forms first so "elections" wins over "election", "financials" over "finance"
  // Longer / more specific forms first so "elections" wins over "election", "geopolitical" over "geopolitics"
  const categoryOrder = [
    "artificial intelligence",
    "elections",
    "election",
    "financials",
    "finance",
    "financial",
    "economics",
    "economy",
    "economic",
    "inflation",
    "fed",
    "rates",
    "entertainment",
    "pop-culture",
    "pop culture",
    "culture",
    "media",
    "celebrity",
    "music",
    "film",
    "movies",
    "sports",
    "geopolitics",
    "geopolitical",
    "politics",
    "political",
    "international",
    "crypto",
    "climate",
    "weather",
    "energy",
    "technology",
    "science",
    "ai",
    "tech",
    "space",
    "world",
    "companies",
    "earnings",
    "business",
    "health",
    "transportation",
    "trump",
  ];
  const normalizedCategory: Record<string, string> = {
    election: "elections",
    economy: "economics",
    economic: "economics",
    weather: "climate",
    geopolitical: "geopolitics",
    political: "politics",
    financial: "finance",
    technology: "tech",
    science: "tech",
    "pop-culture": "culture",
    "pop culture": "culture",
    business: "earnings",
    international: "geopolitics",
    inflation: "economics",
    fed: "economics",
    rates: "finance",
    ai: "tech",
    "artificial intelligence": "tech",
    media: "culture",
    celebrity: "culture",
    music: "culture",
    film: "culture",
    movies: "culture",
    energy: "climate",
    space: "world",
  };
  const hasTopHottestBest = /\b(?:top|hottest|best|most\s*traded|highest\s*volume)\s*(?:\d+\s*)?/.test(t);
  const hasMarketsContext = /\bmarkets?\b/.test(t) || /\bprediction\b/.test(t);
  for (const cat of categoryOrder) {
    if (!t.includes(cat)) continue;
    // Return category if: (1) classic "top/hottest/best X markets", or (2) user asked for a specific category in a markets context (e.g. "crypto markets today", "high-volume crypto markets")
    if (hasTopHottestBest || hasMarketsContext) {
      return normalizedCategory[cat] ?? cat;
    }
  }
  return undefined;
}

/** Default and max count per provider when user doesn't specify a number. */
const DEFAULT_TOP_MARKETS_LIMIT = 3;
const MAX_TOP_MARKETS_LIMIT = 10;

/**
 * Extract requested count from query (e.g. "top 5 sports markets" -> 5). Default 3, capped at 10.
 */
export function extractTopMarketsLimit(text: string): number {
  const t = (text || "").trim();
  const match =
    t.match(/\b(?:top|hottest|best)\s*(\d+)\s*(?:prediction\s*)?(?:markets?|sports|politics|crypto|finance|etc\.?)/i) ??
    t.match(/\b(?:the\s*)?(?:top|hottest|best)\s*(\d+)\b/i) ??
    t.match(/\b(\d+)\s*(?:top|hottest|best)?\s*(?:prediction\s*)?markets?\b/i) ??
    t.match(/\b(?:list|show|get|give|find)\s+(?:me\s+)?(?:the\s+)?(?:top\s+)?(\d+)\s*markets?/i) ??
    t.match(/\b(?:top|hottest|best)\s*(\d+)\s*(?:political|geopolitical|sports|crypto|finance|tech)\s*markets?/i);
  if (!match) return DEFAULT_TOP_MARKETS_LIMIT;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TOP_MARKETS_LIMIT;
  return Math.min(n, MAX_TOP_MARKETS_LIMIT);
}

/**
 * Build a contextual suggest/caption message for top-markets cards using the detected category and provider.
 * Called after we've determined the question is a top-markets intent so we can show a relevant line (e.g. "Here are the top election markets on Kalshi.").
 */
export function buildTopMarketsSuggestMessage(params: {
  category?: string;
  provider?: "polymarket" | "kalshi";
}): string {
  const { category, provider } = params;
  const categoryLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : "";
  const platform = provider === "kalshi" ? "Kalshi" : provider === "polymarket" ? "Polymarket" : "";
  if (categoryLabel && platform) {
    return `\n\nHere are the top ${categoryLabel} markets on ${platform}. Click any card to trade on Rex Markets.`;
  }
  if (categoryLabel) {
    return `\n\nHere are the top ${categoryLabel} prediction markets. Click any card to trade on Rex Markets.`;
  }
  if (platform) {
    return `\n\nHere are the top prediction markets on ${platform}. Click any card to trade on Rex Markets.`;
  }
  return "\n\nHere are the top prediction markets by volume. Click any card to trade on Rex Markets.";
}

// Kalshi search/series API category values (from api/kalshi/markets/route.ts).
// Use exact strings: "Climate and Weather", "Science and Technology", "Financials", etc.
const KALSHI_CATEGORY_MAP: Record<string, string> = {
  sports: "Sports",
  politics: "Politics",
  political: "Politics",
  crypto: "Crypto",
  finance: "Financials",
  financial: "Financials",
  financials: "Financials",
  economics: "Economics",
  economy: "Economics",
  economic: "Economics",
  climate: "Climate and Weather",
  weather: "Climate and Weather",
  entertainment: "Entertainment",
  culture: "Entertainment",
  tech: "Science and Technology",
  technology: "Science and Technology",
  science: "Science and Technology",
  "science and technology": "Science and Technology",
  elections: "Politics",
  election: "Politics",
  world: "World",
  international: "World",
  companies: "Companies",
  earnings: "Companies",
  business: "Companies",
  health: "Health",
  transportation: "Transportation",
  geopolitics: "Politics",
  geopolitical: "Politics",
  trump: "Politics",
  inflation: "Economics",
  fed: "Economics",
  rates: "Financials",
  ai: "Science and Technology",
  "artificial intelligence": "Science and Technology",
  media: "Entertainment",
  celebrity: "Entertainment",
  music: "Entertainment",
  film: "Entertainment",
  movies: "Entertainment",
  energy: "Climate and Weather",
  space: "World",
};

/** Display names for "available categories" when a requested category doesn't exist on the platform. */
const KALSHI_TOP_MARKETS_CATEGORY_LIST = [
  "Sports",
  "Politics",
  "Crypto",
  "Financials",
  "Economics",
  "Climate and Weather",
  "Entertainment",
  "Science and Technology",
  "Companies",
  "Health",
  "Transportation",
  "World",
];
const POLYMARKET_TOP_MARKETS_CATEGORY_LIST = [
  "Sports",
  "Politics",
  "Crypto",
  "Finance",
  "Economy",
  "Climate",
  "Culture",
  "Entertainment",
  "Tech",
  "Elections",
  "World",
  "Geopolitics",
  "Earnings",
];

/** Defensive filter: treat event as expired if endDate is in the past (API already uses archived=false, closed=false). */
function isExpiredPolymarketEvent(m: any): boolean {
  const raw = m?.rawEventData;
  const endDate =
    raw?.endDate ??
    raw?.end_date_iso ??
    raw?.markets?.[0]?.endDate ??
    raw?.markets?.[0]?.endDateIso;
  if (!endDate) return false;
  try {
    return new Date(endDate).getTime() < Date.now();
  } catch {
    return false;
  }
}

/** Defensive filter: treat as expired if status is not "open" or close_time is in the past (API already uses status=open). */
function isExpiredKalshiMarket(m: any): boolean {
  const status = (m?.status ?? m?.rawMarketData?.status ?? "").toString().toLowerCase();
  if (status && status !== "open") return true;
  const closeTime = m?.close_time ?? m?.expected_expiration_time ?? m?.rawMarketData?.close_ts;
  if (!closeTime) return false;
  try {
    return new Date(closeTime).getTime() < Date.now();
  } catch {
    return false;
  }
}

export type FetchTopMarketsOptions = {
  category?: string;
  /** Number of top markets to return per provider (default 3, max 10). */
  limit?: number;
  /** When set, only fetch and return this provider; the other is returned empty. */
  provider?: "polymarket" | "kalshi";
};

/**
 * Fetch top Polymarket events directly from gamma-api (avoids calling our own API
 * so it works on Vercel preview/dev where internal fetches can 401).
 */
async function fetchPolymarketEventsDirect(params: {
  limit: number;
  order: string;
  ascending: string;
  tagSlug?: string;
}): Promise<any[]> {
  const searchParams = new URLSearchParams({
    limit: String(params.limit),
    offset: "0",
    active: "true",
    archived: "false",
    closed: "false",
    order: params.order,
    ascending: params.ascending,
  });
  if (params.tagSlug) searchParams.set("tag_slug", params.tagSlug);
  const url = `https://gamma-api.polymarket.com/events?${searchParams.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch top Kalshi series directly from Kalshi API (avoids calling our own API
 * so it works on Vercel preview/dev where internal fetches can 401).
 */
async function fetchKalshiSeriesDirect(params: {
  pageSize: number;
  category?: string;
}): Promise<any[]> {
  const searchParams = new URLSearchParams({
    order_by: "trending",
    status: "open",
    page_size: String(params.pageSize),
    with_milestones: "true",
  });
  if (params.category) {
    const mapped = KALSHI_CATEGORY_MAP[params.category.toLowerCase()] ?? params.category;
    searchParams.set("category", mapped);
  }
  const url = `https://api.elections.kalshi.com/v1/search/series?${searchParams.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data?.current_page;
  return Array.isArray(list) ? list : [];
}

export type FetchTopPredictionMarketsResult = {
  polymarket: TopMarketCard[];
  kalshi: TopMarketCard[];
  message?: string;
  categoryList?: string[];
};

function buildPolymarketCards(events: any[], topN: number): TopMarketCard[] {
  const asMarkets = events.map((event: any) => ({
    slug: event.slug,
    ticker: event.ticker,
    id: event.id,
    title: event.title,
    volume: event.volume ?? 0,
    volume24hr: event.volume24hr ?? 0,
    image: event.image,
    icon: event.icon,
    rawEventData: event,
  }));
  const nonExpired = asMarkets.filter((m: any) => !isExpiredPolymarketEvent(m));
  const byVolume = [...nonExpired].sort((a: any, b: any) => {
    const vA = Number(a.volume24hr ?? a.volume) || 0;
    const vB = Number(b.volume24hr ?? b.volume) || 0;
    return vB - vA;
  });
  return byVolume.slice(0, topN).map((m: any) => ({
    id: m.slug || m.ticker || m.id || "",
    title: m.title || "Market",
    volume: Number(m.volume) || 0,
    volume24hr: Number(m.volume24hr) || 0,
    provider: "polymarket" as const,
    imageUrl: m.image || m.icon || m.rawEventData?.image || m.rawEventData?.icon || undefined,
  }));
}

function buildKalshiCards(seriesList: any[], topN: number): TopMarketCard[] {
  if (seriesList.length === 0) return [];
  const asMarkets = seriesList.map((series: any) => {
    const firstMarket = series.markets?.[0];
    return {
      event_ticker: series.event_ticker,
      series_ticker: series.series_ticker,
      ticker: firstMarket?.ticker ?? series.event_ticker,
      title: series.event_title || series.series_title || "",
      volume: series.total_volume ?? 0,
      volume_24h: series.total_volume ?? 0,
      rawMarketData: firstMarket,
      rawSeriesData: series,
      close_time: firstMarket?.close_ts ?? firstMarket?.expected_expiration_ts,
      status: firstMarket?.status ?? "open",
    };
  });
  const nonExpired = asMarkets.filter((m: any) => !isExpiredKalshiMarket(m));
  const byVolume = [...nonExpired].sort((a: any, b: any) => {
    const vA = Number(a.volume_24h ?? a.volume) || 0;
    const vB = Number(b.volume_24h ?? b.volume) || 0;
    return vB - vA;
  });
  return byVolume.slice(0, topN).map((m: any) => {
    const seriesTicker = m.series_ticker || m.rawSeriesData?.series_ticker || m.event_ticker || m.ticker;
    const imageUrl = seriesTicker
      ? `https://d1lvyva3zy5u58.cloudfront.net/series-images-webp/${encodeURIComponent(seriesTicker)}.webp?size=sm`
      : undefined;
    return {
      id: m.event_ticker || m.series_ticker || m.ticker || "",
      title: m.title || "Market",
      volume: Number(m.volume) || 0,
      volume24hr: Number(m.volume_24h ?? m.volume) || 0,
      provider: "kalshi" as const,
      imageUrl,
    };
  });
}

export async function fetchTopPredictionMarkets(
  _baseUrl: string,
  options?: FetchTopMarketsOptions
): Promise<FetchTopPredictionMarketsResult> {
  const out: FetchTopPredictionMarketsResult = {
    polymarket: [],
    kalshi: [],
  };
  const category = options?.category;
  const providerFilter = options?.provider;
  const topN = Math.min(
    Math.max(1, options?.limit ?? DEFAULT_TOP_MARKETS_LIMIT),
    MAX_TOP_MARKETS_LIMIT
  );
  const polyTag = category ? POLY_TAG_BY_CATEGORY[category] : undefined;

  const fetchPoly = providerFilter !== "kalshi";
  const fetchKalshi = providerFilter !== "polymarket";

  try {
    const [polyEvents, kalshiSeriesList] = await Promise.all([
      fetchPoly
        ? fetchPolymarketEventsDirect({
            limit: 15,
            order: "volume24hr",
            ascending: "false",
            tagSlug: polyTag,
          })
        : Promise.resolve([]),
      fetchKalshi
        ? fetchKalshiSeriesDirect({
            pageSize: 25,
            category: category || undefined,
          })
        : Promise.resolve([]),
    ]);

    if (fetchPoly && polyEvents.length > 0) {
      out.polymarket = buildPolymarketCards(polyEvents, topN);
    }
    if (fetchKalshi && kalshiSeriesList.length > 0) {
      out.kalshi = buildKalshiCards(kalshiSeriesList, topN);
    }

    // When user asked for a single provider + category and that provider has no results,
    // show a friendly message, top markets without category, and the list of available categories.
    const singleProvider = providerFilter;
    const categoryDisplay = category ? category.charAt(0).toUpperCase() + category.slice(1) : "";
    if (singleProvider && category && categoryDisplay) {
      const chosen = singleProvider === "kalshi" ? out.kalshi : out.polymarket;
      if (chosen.length === 0) {
        if (singleProvider === "kalshi") {
          const fallbackSeries = await fetchKalshiSeriesDirect({ pageSize: 25 });
          out.kalshi = buildKalshiCards(fallbackSeries, topN);
          out.message = `There is no ${categoryDisplay} category in Kalshi. Here are the top ${Math.min(topN, out.kalshi.length)} markets in Kalshi.`;
          out.categoryList = KALSHI_TOP_MARKETS_CATEGORY_LIST;
        } else {
          const fallbackEvents = await fetchPolymarketEventsDirect({
            limit: 15,
            order: "volume24hr",
            ascending: "false",
          });
          out.polymarket = buildPolymarketCards(fallbackEvents, topN);
          out.message = `There is no ${categoryDisplay} category in Polymarket. Here are the top ${Math.min(topN, out.polymarket.length)} markets in Polymarket.`;
          out.categoryList = POLYMARKET_TOP_MARKETS_CATEGORY_LIST;
        }
      }
    }
  } catch (e) {
    console.error("Top prediction markets fetch failed", e);
  }

  return out;
}
