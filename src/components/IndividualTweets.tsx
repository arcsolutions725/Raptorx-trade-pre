"use client";

import Image from "next/image";
import { useState } from "react";

interface Tweet {
  id: string;
  author: string;
  username: string;
  content: string;
  likes: number;
  retweets: number;
  replies: number;
  timestamp: string;
  verified: boolean;
  profileImage: string;
}

interface IndividualTweetsProps {
  tweets: Tweet[];
  ticker: string;
}

export function IndividualTweets({ tweets, ticker }: IndividualTweetsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const tweetsPerPage = 5;
  const totalPages = Math.ceil(tweets.length / tweetsPerPage);

  const getCurrentTweets = () => {
    const start = currentIndex * tweetsPerPage;
    return tweets.slice(start, start + tweetsPerPage);
  };

  const nextPage = () => {
    if (currentIndex < totalPages - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const prevPage = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return "now";
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">Individual Tweets</h2>
        <div className="flex items-center gap-4">
          <span className="text-white/70 text-sm">
            Showing {currentIndex * tweetsPerPage + 1}-
            {Math.min((currentIndex + 1) * tweetsPerPage, tweets.length)} of{" "}
            {tweets.length} tweets
          </span>
          <div className="flex gap-2">
            <button
              onClick={prevPage}
              disabled={currentIndex === 0}
              className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ←
            </button>
            <button
              onClick={nextPage}
              disabled={currentIndex >= totalPages - 1}
              className="p-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {getCurrentTweets().map((tweet) => (
          <div
            key={tweet.id}
            className="p-4 bg-black/20 rounded-lg border border-white/10"
          >
            {/* Tweet Header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-400 rounded-full flex-shrink-0 flex items-center justify-center">
                {tweet.profileImage ? (
                  <Image
                    src={tweet.profileImage}
                    alt=""
                    className="w-full h-full rounded-full"
                  />
                ) : (
                  <span className="text-white text-sm">{tweet.author[0]}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">
                    {tweet.author}
                  </span>
                  {tweet.verified && <span className="text-blue-400">✓</span>}
                  <span className="text-white/50">@{tweet.username}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-white/50 text-sm">
                    {formatTimestamp(tweet.timestamp)}
                  </span>
                </div>
              </div>
            </div>

            {/* Tweet Content */}
            <div className="mb-4">
              <p className="text-white/90 leading-relaxed">
                {tweet.content.split(" ").map((word, index) => {
                  const isHighlighted =
                    word.toLowerCase().includes(ticker.toLowerCase()) ||
                    word.startsWith("$") ||
                    word.startsWith("#");
                  return (
                    <span
                      key={index}
                      className={
                        isHighlighted ? "text-blue-400 font-medium" : ""
                      }
                    >
                      {word}{" "}
                    </span>
                  );
                })}
              </p>
            </div>

            {/* Tweet Stats */}
            <div className="flex items-center gap-6 text-sm text-white/50">
              <div className="flex items-center gap-1 hover:text-blue-400 transition-colors">
                <span>💬</span>
                <span>{formatNumber(tweet.replies)}</span>
              </div>
              <div className="flex items-center gap-1 hover:text-green-400 transition-colors">
                <span>🔄</span>
                <span>{formatNumber(tweet.retweets)}</span>
              </div>
              <div className="flex items-center gap-1 hover:text-red-400 transition-colors">
                <span>❤️</span>
                <span>{formatNumber(tweet.likes)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center mt-6">
        <div className="flex gap-2">
          {Array.from({ length: totalPages }, (_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentIndex ? "bg-white" : "bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
