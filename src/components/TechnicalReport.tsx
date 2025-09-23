interface TechnicalAnalysisData {
  chartAnalysis: string;
  whaleActivity: string;
  holderAnalysis: string;
  volumeAnalysis: string;
  marketSentiment: string;
  cexListings: string;
  newsUpdates: string;
  socialMedia: string;
  liquidityAnalysis: string;
}

interface TechnicalReportProps {
  data: TechnicalAnalysisData;
}

export function TechnicalReport({ data }: TechnicalReportProps) {
  const sections = [
    {
      title: "Chart Analysis & Technical Indicators",
      content: data.chartAnalysis,
      icon: "📊",
    },
    {
      title: "Whale Activity & Large Wallet Movements",
      content: data.whaleActivity,
      icon: "🐋",
    },
    {
      title: "Holder Demographics & Distribution",
      content: data.holderAnalysis,
      icon: "👥",
    },
    {
      title: "Volume Analysis & Trading Patterns",
      content: data.volumeAnalysis,
      icon: "📈",
    },
    {
      title: "Market Sentiment & Price Action",
      content: data.marketSentiment,
      icon: "💭",
    },
    {
      title: "Exchange Listings & Availability",
      content: data.cexListings,
      icon: "🏛️",
    },
    {
      title: "News & Media Coverage",
      content: data.newsUpdates,
      icon: "📰",
    },
    {
      title: "Social Media Presence",
      content: data.socialMedia,
      icon: "🐦",
    },
    {
      title: "Liquidity & Market Cap Analysis",
      content: data.liquidityAnalysis,
      icon: "💧",
    },
  ];

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-6">
        Technical Analysis
      </h2>
      <div className="space-y-6">
        {sections.map((section, index) => (
          <div key={index} className="border-l-4 border-blue-400 pl-4">
            <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
              <span>{section.icon}</span>
              {section.title}
            </h3>
            <div className="text-white/80 leading-relaxed">
              {section.content.split("\n").map((paragraph, pIndex) => (
                <p key={pIndex} className="mb-3 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
