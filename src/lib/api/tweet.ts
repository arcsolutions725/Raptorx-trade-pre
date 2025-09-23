/* eslint-disable @typescript-eslint/no-explicit-any */
const BEARER_TOKEN = (process.env.X_BEARER_TOKEN || "") as string;

export async function getTweetsSearch(
  contractAddress: string,
  ticker: string,
  projectName?: string,
  topN: number = 40
): Promise<{
  success: boolean;
  data?: string[];
  error?: any;
  status?: number;
}> {
  if (!BEARER_TOKEN) {
    throw new Error("X_BEARER_TOKEN is not set in environment variables");
  }

  try {
    const sanitizedTicker = ticker.replace(/^\$/, "");
    const keywords = [sanitizedTicker, contractAddress];
    if (projectName && projectName.trim() !== "") keywords.push(projectName);

    const query = encodeURIComponent(
      `"${contractAddress}" "${ticker}" -is:retweet lang:en`
    );

    const url = `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${topN}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      return { success: false, status: response.status, error: errorData };
    }

    const json: any = await response.json();
    const tweetsArray: any[] = Array.isArray(json.data) ? json.data : [];

    const topTweets = tweetsArray.map((t) => t.text);

    if (topTweets.length === 0) {
      return {
        success: true,
        data: [],
        error: "No tweets found for the given criteria",
      };
    }

    return { success: true, data: topTweets };
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}
