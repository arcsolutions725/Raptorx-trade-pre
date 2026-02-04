/**
 * Local storage utility for managing market chat history
 * Stores chat messages by eventTicker for persistence
 */

export type MarketChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type MarketChatHistory = {
  eventTicker: string;
  marketTitle: string;
  messages: MarketChatMessage[];
  lastUpdated: string;
};

const STORAGE_KEY = "raptorx_market_chats";
const MAX_HISTORIES = 50; // Limit to prevent localStorage overflow

/**
 * Get all stored market chat histories
 */
function getAllChats(): Record<string, MarketChatHistory> {
  if (typeof window === "undefined") return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error("Failed to load market chat histories:", error);
    return {};
  }
}

/**
 * Save all chat histories to localStorage
 */
function saveAllChats(chats: Record<string, MarketChatHistory>) {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (error) {
    console.error("Failed to save market chat histories:", error);
  }
}

/**
 * Get chat history for a specific eventTicker
 */
export function getMarketChatHistory(eventTicker: string): MarketChatHistory | null {
  const allChats = getAllChats();
  return allChats[eventTicker] || null;
}

/**
 * Save a message to the chat history for a specific eventTicker
 */
export function saveMarketChatMessage(
  eventTicker: string,
  marketTitle: string,
  message: MarketChatMessage
): void {
  const allChats = getAllChats();
  
  if (!allChats[eventTicker]) {
    allChats[eventTicker] = {
      eventTicker,
      marketTitle,
      messages: [],
      lastUpdated: new Date().toISOString(),
    };
  }
  
  allChats[eventTicker].messages.push(message);
  allChats[eventTicker].lastUpdated = new Date().toISOString();
  
  // Clean up old histories if we exceed the limit
  const sortedKeys = Object.keys(allChats).sort((a, b) => {
    const dateA = new Date(allChats[a].lastUpdated).getTime();
    const dateB = new Date(allChats[b].lastUpdated).getTime();
    return dateB - dateA; // Most recent first
  });
  
  if (sortedKeys.length > MAX_HISTORIES) {
    const keysToRemove = sortedKeys.slice(MAX_HISTORIES);
    keysToRemove.forEach((key) => delete allChats[key]);
  }
  
  saveAllChats(allChats);
}

/**
 * Save multiple messages to the chat history (useful for initial load)
 */
export function saveMarketChatHistory(
  eventTicker: string,
  marketTitle: string,
  messages: MarketChatMessage[]
): void {
  const allChats = getAllChats();
  
  allChats[eventTicker] = {
    eventTicker,
    marketTitle,
    messages,
    lastUpdated: new Date().toISOString(),
  };
  
  saveAllChats(allChats);
}

/**
 * Clear chat history for a specific eventTicker
 */
export function clearMarketChatHistory(eventTicker: string): void {
  const allChats = getAllChats();
  delete allChats[eventTicker];
  saveAllChats(allChats);
}

/**
 * Clear all market chat histories
 */
export function clearAllMarketChatHistories(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear market chat histories:", error);
  }
}
