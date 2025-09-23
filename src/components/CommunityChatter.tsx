interface CommunityChatterData {
  sentiment: string;
  keyDiscussions: string[];
  socialMetrics: {
    overallSentiment: "bullish" | "bearish" | "neutral";
    engagementLevel: "high" | "medium" | "low";
    trendingTopics: string[];
    influencerMentions: number;
  };
}

interface CommunityChatterProps {
  data: CommunityChatterData;
}

export function CommunityChatter({ data }: CommunityChatterProps) {
  const getSentimentColor = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case "bullish":
        return "text-green-400";
      case "bearish":
        return "text-red-400";
      default:
        return "text-yellow-400";
    }
  };

  const getSentimentEmoji = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case "bullish":
        return "🚀";
      case "bearish":
        return "📉";
      default:
        return "😐";
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-6">
        Community Chatter
      </h2>

      {/* Overall Sentiment */}
      <div className="mb-6 p-4 bg-black/20 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">
            Overall Community Sentiment
          </h3>
          <div
            className={`flex items-center gap-2 ${getSentimentColor(
              data.socialMetrics.overallSentiment
            )}`}
          >
            <span>
              {getSentimentEmoji(data.socialMetrics.overallSentiment)}
            </span>
            <span className="font-semibold capitalize">
              {data.socialMetrics.overallSentiment}
            </span>
          </div>
        </div>
        <p className="text-white/80 leading-relaxed">{data.sentiment}</p>
      </div>

      {/* Social Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-black/20 rounded-lg text-center">
          <h4 className="text-white font-medium mb-2">Engagement Level</h4>
          <p
            className={`text-lg font-bold ${
              data.socialMetrics.engagementLevel === "high"
                ? "text-green-400"
                : data.socialMetrics.engagementLevel === "medium"
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {data.socialMetrics.engagementLevel.toUpperCase()}
          </p>
        </div>
        <div className="p-4 bg-black/20 rounded-lg text-center">
          <h4 className="text-white font-medium mb-2">Influencer Mentions</h4>
          <p className="text-lg font-bold text-blue-400">
            {data.socialMetrics.influencerMentions}
          </p>
        </div>
        <div className="p-4 bg-black/20 rounded-lg text-center">
          <h4 className="text-white font-medium mb-2">Trending Topics</h4>
          <p className="text-lg font-bold text-purple-400">
            {data.socialMetrics.trendingTopics.length}
          </p>
        </div>
      </div>

      {/* Key Discussions */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-white mb-4">
          Key Community Discussions
        </h3>
        <div className="space-y-3">
          {data.keyDiscussions.map((discussion, index) => (
            <div
              key={index}
              className="p-3 bg-black/20 rounded-lg border-l-4 border-purple-400"
            >
              <p className="text-white/80">{discussion}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trending Topics */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Trending Topics</h3>
        <div className="flex flex-wrap gap-2">
          {data.socialMetrics.trendingTopics.map((topic, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm border border-purple-500/30"
            >
              #{topic}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
