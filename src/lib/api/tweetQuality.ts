import type { TweetData } from "@/lib/api/tweet";

const SCAM_RE =
  /\b(dm\s*me|guaranteed\s+\d|100x|1000x|airdrop\s*claim|send\s+(sol|eth|bnb)|double\s+your|free\s+mint|seed\s*phrase|connect\s+wallet\s+to\s+claim|giveaway\s+bot)\b/i;

/** Any airdrop mention — scam claim links dominate What's New if these stay. */
const AIRDROP_RE = /air[\s-]?drop/i;

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

const STABLECOINS = new Set(["USDC", "USDT", "DAI"]);

const MEME_LAUNCH_RE =
  /\b(just\s+launched|fair\s*launch|stealth\s*launch|new\s+(gem|meme|token|coin)|ca\s*:|contract\s*:|dev\s+sold|bundled|sniper|ape\s+this)\b/i;

const LISTING_SPAM_RE =
  /\b(launchpad|presale|now\s+live|just\s+listed|listed\s+on|listing\s+on|bep20|bep-20|erc20|erc-20|new\s+pair|add(?:ed)?\s+liquidity|live\s+on\s+(pcs|pancake|uniswap|raydium))\b/i;

const BASE_ASSET_TOPIC_RE =
  /\b(price|etf|etfs|staking|staked|validator|tps|network|blockchain|ecosystem|tvl|sec|spot\s+etf|firedancer|inflation|supply|holders?|chart|breakout|support|resistance|market\s+cap|mcap)\b/i;

const STABLE_TOPIC_RE =
  /\b(circle|tether|peg|depeg|de-peg|reserves?|attestation|issuer|redemption|blackrock|buidl|stablecoin|usd\s+coin)\b/i;

export type TweetAssetContext = {
  ticker: string;
  projectName?: string;
};

function sanitizeTicker(ticker: string): string {
  return ticker.replace(/^\$+/, "").replace(/[^\w]/g, "").slice(0, 32);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCashtags(text: string): string[] {
  return (text.match(/\$[A-Za-z][A-Za-z0-9-]{1,20}/g) || []).map((c) =>
    c.slice(1).toUpperCase(),
  );
}

function hasExactCashtag(text: string, symbol: string): boolean {
  return new RegExp(
    `(?<![A-Za-z0-9])\\$${escapeRegExp(symbol)}(?![A-Za-z0-9-])`,
    "i",
  ).test(text);
}

function hasHyphenatedTicker(text: string, symbol: string): boolean {
  return new RegExp(`\\$${escapeRegExp(symbol)}-[A-Za-z0-9]+`, "i").test(text);
}

const GENERIC_PROJECT_NAME_RE =
  /^(wrapped\s+)?(sol|solana|usd coin|tether|usd|usdc|usdt|coin|token|finance|protocol|ai|inu|cat|dog|pepe|meme)$/i;

function mentionsSubject(
  text: string,
  symbol: string,
  projectName?: string,
): boolean {
  if (hasExactCashtag(text, symbol)) return true;
  if (
    new RegExp(
      `(?<![A-Za-z0-9#])#${escapeRegExp(symbol)}(?![A-Za-z0-9-])`,
      "i",
    ).test(text)
  ) {
    return true;
  }
  if (STABLECOINS.has(symbol) || BASE_QUOTE_ASSETS.has(symbol)) return false;
  const name = (projectName || "").trim();
  if (name.length >= 5 && !GENERIC_PROJECT_NAME_RE.test(name)) {
    return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text);
  }
  return false;
}

function cashtagCounts(tags: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tag of tags) {
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return counts;
}

/**
 * Applies to every coin: keep tweets about THIS ticker as the subject.
 * Drops listing spam, $TICKER-BEP20 clones, and multi-coin shill lists.
 */
export function isOnTopicForAsset(
  t: TweetData,
  ticker: string,
  projectName?: string,
): boolean {
  const text = t.text || "";
  const symbol = sanitizeTicker(ticker).toUpperCase();
  if (!symbol || !text.trim()) return false;

  const namedSolana =
    (symbol === "SOL" || symbol === "WSOL") &&
    /\bsolana\b/i.test(text) &&
    BASE_ASSET_TOPIC_RE.test(text);
  if (!mentionsSubject(text, symbol, projectName) && !namedSolana) return false;
  if (hasHyphenatedTicker(text, symbol)) return false;
  if (
    LISTING_SPAM_RE.test(text) ||
    MEME_LAUNCH_RE.test(text) ||
    SCAM_RE.test(text) ||
    AIRDROP_RE.test(text)
  ) {
    return false;
  }
  if (
    /\b(launched|launching|deployed|fair\s*launch|stealth).{0,60}\b(on\s+\$?[a-z]{2,10}|on\s+solana|on\s+ethereum|on\s+bsc)\b/i.test(
      text,
    )
  ) {
    return false;
  }

  const tags = extractCashtags(text).map((c) =>
    c.includes("-") ? c.split("-")[0] : c,
  );
  const others = tags.filter((c) => {
    if (c === symbol) return false;
    if (c === `W${symbol}` || symbol === `W${c}`) return false;
    return true;
  });
  const counts = cashtagCounts(tags);
  const subjectCount = counts.get(symbol) || (namedSolana ? 1 : 0);
  const maxOther = Math.max(0, ...[...counts.entries()].filter(([c]) => c !== symbol).map(([, n]) => n));
  if (maxOther > subjectCount) return false;

  const isBase = BASE_QUOTE_ASSETS.has(symbol);
  if (isBase) {
    if (others.length >= 1) return false;
    if (STABLECOINS.has(symbol)) return STABLE_TOPIC_RE.test(text);
    return BASE_ASSET_TOPIC_RE.test(text);
  }

  if (others.length >= 2) return false;
  return true;
}

export type WhatsNewTweet = {
  id: string;
  text: string;
  url: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  viewCount: number;
  tweeter: {
    username: string;
    name: string;
    publicImageUrl: string;
    followers: number;
    isBlueVerified: boolean;
  };
};

function engagementScore(t: TweetData): number {
  return (
    (t.likeCount || 0) * 3 +
    (t.retweetCount || 0) * 5 +
    (t.quoteCount || 0) * 4 +
    (t.replyCount || 0) * 1.5 +
    (t.viewCount || 0) * 0.008 +
    (t.bookmarkCount || 0) * 2
  );
}

function qualityScore(t: TweetData): number {
  const followers = t.tweeter?.followers || 0;
  const followerWeight = Math.log10(followers + 10);
  const verifiedBoost = t.tweeter?.isBlueVerified ? 1.45 : 1;
  const replyPenalty = t.isReply ? 0.55 : 1;
  const autoPenalty = t.tweeter?.isAutomated ? 0.15 : 1;
  const sensitivePenalty = t.tweeter?.possiblySensitive ? 0.35 : 1;
  const text = t.text || "";
  const scamPenalty = SCAM_RE.test(text) || AIRDROP_RE.test(text) ? 0.08 : 1;
  return (
    engagementScore(t) *
    followerWeight *
    verifiedBoost *
    replyPenalty *
    autoPenalty *
    sensitivePenalty *
    scamPenalty
  );
}

/** Drop obvious low-quality / scam-like posts before ranking. */
export function isHighQualityTweetCandidate(t: TweetData): boolean {
  const text = (t.text || "").trim();
  if (text.length < 20) return false;
  if (SCAM_RE.test(text) || AIRDROP_RE.test(text)) return false;
  if (t.tweeter?.isAutomated) return false;
  if (t.tweeter?.possiblySensitive) return false;

  const followers = t.tweeter?.followers || 0;
  const likes = t.likeCount || 0;
  const rts = t.retweetCount || 0;

  if (t.tweeter?.isBlueVerified) return true;
  if (followers >= 500) return true;
  if (followers >= 100 && (likes >= 5 || rts >= 2)) return true;
  if (likes >= 25 || rts >= 8) return true;
  return false;
}

export function selectTopQualityTweets(
  tweets: TweetData[],
  topN: number = 5,
  asset?: TweetAssetContext,
): TweetData[] {
  const pool = Array.isArray(tweets) ? tweets : [];
  // Hard drop: never show airdrop tweets, even if that leaves the list empty.
  const noAirdrop = pool.filter((t) => !AIRDROP_RE.test(t.text || ""));
  const ticker = asset?.ticker?.trim();
  const onTopic = ticker
    ? noAirdrop.filter((t) => isOnTopicForAsset(t, ticker, asset?.projectName))
    : noAirdrop;
  // Never fall back to off-topic tweets — empty is better than the wrong asset.
  const source = onTopic;
  const filtered = source.filter(isHighQualityTweetCandidate);
  const ranked = (filtered.length > 0 ? filtered : source)
    .slice()
    .sort((a, b) => qualityScore(b) - qualityScore(a));

  const seen = new Set<string>();
  const out: TweetData[] = [];
  for (const t of ranked) {
    const key = t.id || `${t.tweeter?.userName || ""}:${t.text?.slice(0, 48)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= topN) break;
  }
  return out;
}

export function toWhatsNewTweet(t: TweetData): WhatsNewTweet {
  return {
    id: t.id || "",
    text: t.text || "",
    url: t.url || "",
    createdAt: t.createdAt || "",
    likeCount: t.likeCount || 0,
    retweetCount: t.retweetCount || 0,
    replyCount: t.replyCount || 0,
    viewCount: t.viewCount || 0,
    tweeter: {
      username: t.tweeter?.userName || t.tweeter?.username || "unknown",
      name: t.tweeter?.name || t.tweeter?.userName || "unknown",
      publicImageUrl: t.tweeter?.publicImageUrl || "",
      followers: t.tweeter?.followers || 0,
      isBlueVerified: Boolean(t.tweeter?.isBlueVerified),
    },
  };
}

export function formatTweetsForPrompt(tweets: WhatsNewTweet[]): string {
  if (!tweets.length) return "No high-quality tweets available.";
  return tweets
    .map(
      (t, i) =>
        `Tweet ${i + 1} by @${t.tweeter.username}` +
        `${t.tweeter.isBlueVerified ? " (verified)" : ""}` +
        ` · ${t.tweeter.followers} followers` +
        ` · ❤ ${t.likeCount} · ↻ ${t.retweetCount}` +
        `${t.url ? ` · ${t.url}` : ""}\n${t.text}`,
    )
    .join("\n\n");
}

export function isLatestDevelopmentsQuery(message: string): boolean {
  return /\b(latest\s+developments?|what'?s\s+new|recent\s+(tweets?|news|updates?|chatter)|latest\s+(tweets?|news|updates?|chatter)|community\s+(buzz|chatter|sentiment|updates?)|social\s+(buzz|sentiment|updates?)|twitter\s+(buzz|updates?|sentiment)|x\s+updates?)\b/i.test(
    message.trim(),
  );
}
