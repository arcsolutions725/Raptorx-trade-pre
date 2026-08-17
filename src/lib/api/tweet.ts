/* eslint-disable @typescript-eslint/no-explicit-any */
const TWITTER_API_KEY = (process.env.TWITTER_API_KEY || "") as string;

export interface TweetData {
  id: string;
  text: string;
  url: string;
  source: string;
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount: number;
  bookmarkCount: number;
  createdAt: string;
  lang: string;
  isReply: boolean;
  inReplyToId?: string;
  inReplyToUserId?: string;
  inReplyToUsername?: string;
  conversationId?: string;
  isLimitedReply: boolean;
  media: {
    mediaUrl: string;
    mediaPreview: string;
  };
  tweeter: {
    userName: string;
    id: string;
    name: string;
    isBlueVerified: boolean;
    verifiedType?: string;
    publicImageUrl: string;
    coverPicture?: string;
    description: string;
    location?: string;
    followers: number;
    following: number;
    canDm: boolean;
    createdAt: string;
    favouritesCount: number;
    hasCustomTimelines: boolean;
    isTranslator: boolean;
    mediaCount: number;
    statusesCount: number;
    withheldInCountries?: string[];
    possiblySensitive: boolean;
    pinnedTweetIds?: string[];
    isAutomated: boolean;
    automatedBy?: string;
    unavailable: boolean;
    message?: string;
    unavailableReason?: string;
    username: string; // Backward compatibility alias for userName
  };
  entities: {
    hashtags: Array<{
      indices: number[];
      text: string;
    }>;
    urls: Array<{
      display_url: string;
      expanded_url: string;
      indices: number[];
      url: string;
    }>;
    user_mentions: Array<{
      id_str: string;
      name: string;
      screen_name: string;
    }>;
  };
}

function sanitizeTicker(ticker: string): string {
  return ticker.replace(/^\$+/, "").replace(/[^\w]/g, "").slice(0, 32);
}

/** Native / quote assets whose cashtag is used by every other token on that chain. */
const BASE_QUOTE_ASSETS = new Set([
  "SOL",
  "WSOL",
  "ETH",
  "WETH",
  "BTC",
  "BNB",
  "WBNB",
  "USDC",
  "USDT",
  "DAI",
  "MON",
]);

function isBaseQuoteAsset(symbol: string): boolean {
  return BASE_QUOTE_ASSETS.has(symbol.toUpperCase());
}

function buildTweetSearchQueries(
  ticker: string,
  projectName?: string,
  contractAddress?: string,
): string[] {
  const symbol = sanitizeTicker(ticker);
  const name = (projectName || "").trim();
  const queries: string[] = [];

  if (!symbol) return [];

  const spamExcl = `-launchpad -presale -listing -BEP20 -"fair launch" -"new gem" -"${symbol}-SOL" -"${symbol}-BEP20" -"${symbol}-ETH"`;

  if (symbol === "USDC") {
    queries.push(
      `$USDC (circle OR peg OR reserves OR depeg OR "usd coin" OR attestation) ${spamExcl} lang:en`,
    );
  } else if (symbol === "USDT") {
    queries.push(
      `$USDT (tether OR peg OR reserves OR depeg OR attestation) ${spamExcl} lang:en`,
    );
  } else if (isBaseQuoteAsset(symbol)) {
    queries.push(
      `$${symbol} (price OR etf OR staking OR staked OR validator OR chart OR tvl OR "market cap") ${spamExcl} -launched -launching lang:en`,
    );
    if (symbol === "SOL" || symbol === "WSOL") {
      queries.push(`("Solana" (price OR etf OR staking OR ETF)) lang:en`);
    }
  } else {
    queries.push(`$${symbol} ${spamExcl} lang:en`);

    const nameLooksUseful =
      name.length >= 5 &&
      name.toLowerCase() !== symbol.toLowerCase() &&
      !/^0x[a-f0-9]{8,}$/i.test(name) &&
      !/^wrapped\s+/i.test(name);
    if (nameLooksUseful) {
      queries.push(
        `"${name.replace(/"/g, "")}" $${symbol} ${spamExcl} lang:en`,
      );
    }
  }

  const ca = (contractAddress || "").trim();
  if (ca.length >= 32 && ca.length <= 64 && !isBaseQuoteAsset(symbol)) {
    queries.push(`${ca} lang:en`);
  }

  return Array.from(new Set(queries));
}

function mapTweet(tweet: any): TweetData {
  const author = tweet.author || {};
  const userName = author.userName || author.username || "";

  return {
    id: tweet.id || "",
    text: tweet.text || "",
    url: tweet.url || "",
    source: tweet.source || "",
    retweetCount: tweet.retweetCount || 0,
    replyCount: tweet.replyCount || 0,
    likeCount: tweet.likeCount || 0,
    quoteCount: tweet.quoteCount || 0,
    viewCount: tweet.viewCount || 0,
    bookmarkCount: tweet.bookmarkCount || 0,
    createdAt: tweet.createdAt || tweet.created_at || "",
    lang: tweet.lang || "en",
    isReply: tweet.isReply || false,
    inReplyToId: tweet.inReplyToId,
    inReplyToUserId: tweet.inReplyToUserId,
    inReplyToUsername: tweet.inReplyToUsername,
    conversationId: tweet.conversationId,
    isLimitedReply: tweet.isLimitedReply || false,
    media: {
      mediaUrl: "",
      mediaPreview: "",
    },
    tweeter: {
      userName,
      id: author.id || "",
      name: author.name || userName,
      isBlueVerified: author.isBlueVerified || false,
      verifiedType: author.verifiedType,
      publicImageUrl: author.profilePicture || author.publicImageUrl || "",
      coverPicture: author.coverPicture,
      description: author.description || "",
      location: author.location,
      followers: author.followers || 0,
      following: author.following || 0,
      canDm: author.canDm || false,
      createdAt: author.createdAt || "",
      favouritesCount: author.favouritesCount || 0,
      hasCustomTimelines: author.hasCustomTimelines || false,
      isTranslator: author.isTranslator || false,
      mediaCount: author.mediaCount || 0,
      statusesCount: author.statusesCount || 0,
      withheldInCountries: author.withheldInCountries || [],
      possiblySensitive: author.possiblySensitive || false,
      pinnedTweetIds: author.pinnedTweetIds || [],
      isAutomated: author.isAutomated || false,
      automatedBy: author.automatedBy,
      unavailable: author.unavailable || false,
      message: author.message,
      unavailableReason: author.unavailableReason,
      username: userName,
    },
    entities: {
      hashtags: tweet.entities?.hashtags || [],
      urls: tweet.entities?.urls || [],
      user_mentions: tweet.entities?.user_mentions || [],
    },
  };
}

const TWEET_FETCH_TIMEOUT_MS = 8_000;
const TWEET_FETCH_ATTEMPTS = 2;

function tweetFetchErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (err as { message?: string })?.message || "Tweet search unavailable";
  if (/fetch failed|ETIMEDOUT|ENOTFOUND|UND_ERR|AbortError|timeout/i.test(raw)) {
    return "Tweet search timed out. Please try again.";
  }
  // twitterapi.io billing / auth — never leak "Credits is not enough. Please recharge"
  if (
    /credit|recharge|quota|insufficient|unauthorized|forbidden|api.?key|payment|balance/i.test(
      raw,
    )
  ) {
    return "Tweet search is temporarily unavailable.";
  }
  return "Tweet search is temporarily unavailable.";
}

async function searchTweetsOnce(
  query: string,
  queryType: "Latest" | "Top",
): Promise<{
  success: boolean;
  tweets: TweetData[];
  error?: any;
  status?: number;
}> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TWEET_FETCH_ATTEMPTS; attempt++) {
    try {
      const url = new URL(
        "https://api.twitterapi.io/twitter/tweet/advanced_search",
      );
      url.searchParams.set("query", query);
      url.searchParams.set("queryType", queryType);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "X-API-Key": TWITTER_API_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(TWEET_FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: `HTTP ${response.status}` }));
        lastError = errorData?.message || errorData;
        console.error(
          "tweet search HTTP",
          response.status,
          typeof lastError === "string" ? lastError : JSON.stringify(lastError),
        );
        if (response.status >= 500 && attempt < TWEET_FETCH_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        return {
          success: false,
          tweets: [],
          status: response.status,
          error: tweetFetchErrorMessage(lastError),
        };
      }

      const json: any = await response.json();
      const tweetsArray: any[] = Array.isArray(json.tweets)
        ? json.tweets
        : Array.isArray(json.data)
          ? json.data
          : [];

      return { success: true, tweets: tweetsArray.map(mapTweet) };
    } catch (err) {
      lastError = err;
      if (attempt < TWEET_FETCH_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }

  return {
    success: false,
    tweets: [],
    error: tweetFetchErrorMessage(lastError),
  };
}

function mergeTweets(groups: TweetData[][]): TweetData[] {
  const seen = new Set<string>();
  const out: TweetData[] = [];
  for (const group of groups) {
    for (const tweet of group) {
      const key = tweet.id || `${tweet.tweeter?.userName}:${tweet.text?.slice(0, 48)}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(tweet);
    }
  }
  return out;
}

export async function getTweetsSearch(
  contractAddress: string,
  ticker: string,
  projectName?: string,
  topN: number = 40
): Promise<{
  success: boolean;
  data?: TweetData[];
  error?: any;
  status?: number;
}> {
  if (!TWITTER_API_KEY) {
    throw new Error("TWITTER_API_KEY is not set in environment variables");
  }

  const queries = buildTweetSearchQueries(ticker, projectName, contractAddress);
  if (!queries.length) {
    return { success: false, data: [], error: "Missing ticker for tweet search" };
  }

  try {
    const collected: TweetData[][] = [];
    let lastError: any;
    let lastStatus: number | undefined;

    for (const query of queries) {
      const result = await searchTweetsOnce(query, "Latest");
      if (!result.success) {
        lastError = result.error;
        lastStatus = result.status;
        if (/timed out/i.test(String(result.error || ""))) break;
        continue;
      }
      if (result.tweets.length) collected.push(result.tweets);
      if (mergeTweets(collected).length >= Math.min(topN, 20)) break;
    }

    if (mergeTweets(collected).length < 8 && !/timed out/i.test(String(lastError || ""))) {
      const topResult = await searchTweetsOnce(queries[0], "Top");
      if (topResult.success && topResult.tweets.length) {
        collected.push(topResult.tweets);
      } else if (!topResult.success) {
        lastError = lastError || topResult.error;
        lastStatus = lastStatus ?? topResult.status;
      }
    }

    const data = mergeTweets(collected).slice(0, topN);
    if (data.length > 0) {
      return { success: true, data };
    }

    if (lastError) {
      return { success: false, data: [], error: lastError, status: lastStatus };
    }

    return {
      success: true,
      data: [],
      error: "No tweets found for the given criteria",
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}
