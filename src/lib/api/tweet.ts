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

  try {
    // Use only ticker with $ prefix for search query
    const tickerWithPrefix = ticker.startsWith("$")
      ? `${ticker} lang:en`
      : `$${ticker} lang:en`;

    const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${tickerWithPrefix}&queryType=Top`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": TWITTER_API_KEY,
      },
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      return { success: false, status: response.status, error: errorData };
    }

    const json: any = await response.json();
    const tweetsArray: any[] = Array.isArray(json.tweets) ? json.tweets : [];

    if (tweetsArray.length === 0) {
      return {
        success: true,
        data: [],
        error: "No tweets found for the given criteria",
      };
    }

    // Transform twitterapi.io response to our TweetData format
    const topTweets: TweetData[] = tweetsArray.map((tweet: any) => {
      const author = tweet.author || {};

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
        createdAt: tweet.createdAt || "",
        lang: tweet.lang || "en",
        isReply: tweet.isReply || false,
        inReplyToId: tweet.inReplyToId,
        inReplyToUserId: tweet.inReplyToUserId,
        inReplyToUsername: tweet.inReplyToUsername,
        conversationId: tweet.conversationId,
        isLimitedReply: tweet.isLimitedReply || false,
        media: {
          mediaUrl: "", // Will be populated from entities if available
          mediaPreview: "",
        },
        tweeter: {
          userName: author.userName || "",
          id: author.id || "",
          name: author.name || "",
          isBlueVerified: author.isBlueVerified || false,
          verifiedType: author.verifiedType,
          publicImageUrl: author.profilePicture || "",
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
          username: author.userName || "", // Backward compatibility
        },
        entities: {
          hashtags: tweet.entities?.hashtags || [],
          urls: tweet.entities?.urls || [],
          user_mentions: tweet.entities?.user_mentions || [],
        },
      };
    });

    return { success: true, data: topTweets };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}
