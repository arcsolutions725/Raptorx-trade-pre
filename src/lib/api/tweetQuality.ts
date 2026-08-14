import type { TweetData } from "@/lib/api/tweet";

const SCAM_RE =
  /\b(dm\s*me|guaranteed\s+\d|100x|1000x|airdrop\s*claim|send\s+(sol|eth|bnb)|double\s+your|free\s+mint|seed\s*phrase|connect\s+wallet\s+to\s+claim|giveaway\s+bot)\b/i;

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
  const scamPenalty = SCAM_RE.test(t.text || "") ? 0.08 : 1;
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
  if (SCAM_RE.test(text)) return false;
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
): TweetData[] {
  const pool = Array.isArray(tweets) ? tweets : [];
  const filtered = pool.filter(isHighQualityTweetCandidate);
  const ranked = (filtered.length > 0 ? filtered : pool)
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
