/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/storage/storage-utils.ts

import { DexScreenerPair } from "../api/dexscreener";

export interface Report {
  id: string;
  contractAddress: string;
  ticker: string;
  projectName?: string;
  content: string;
  createdAt: string;
  dexData: DexScreenerPair | { error: string };
  tweetsData?: any; // Array of tweet objects with sparse data
  securityData?: any; // Security analytics for BNB tokens
  holdersData?: any; // Holder analytics for BNB tokens
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  reportId: string;
  messages: Message[];
  updatedAt: string;
}

export interface NavigationState {
  currentIsViewingChart: boolean;
  currentTokenAddress: string | null;
  selectedTokenData: any | null; // TrendingToken
  hasReportOpen: boolean;
  lastReportId: string | null;
}

export class StorageManager {
  private static REPORTS_KEY = "reports";
  private static CONVERSATION_PREFIX = "conversation_";

  // Report Management
  static getAllReports(): Report[] {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(this.REPORTS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static getReport(reportId: string): Report | null {
    const reports = this.getAllReports();
    return reports.find((r) => r.id === reportId) || null;
  }

  static saveReport(report: Report): void {
    if (typeof window === "undefined") return;
    const reports = this.getAllReports();
    const existingIndex = reports.findIndex((r) => r.id === report.id);

    if (existingIndex >= 0) {
      reports[existingIndex] = report;
    } else {
      reports.unshift(report); // Add new report at the beginning
    }

    localStorage.setItem(this.REPORTS_KEY, JSON.stringify(reports));
  }

  static deleteReport(reportId: string): void {
    if (typeof window === "undefined") return;
    const reports = this.getAllReports();
    const filtered = reports.filter((r) => r.id !== reportId);
    localStorage.setItem(this.REPORTS_KEY, JSON.stringify(filtered));

    // Also delete associated conversation
    this.deleteConversation(reportId);
  }

  // Conversation Management
  static getConversation(conversationId: string): Conversation | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(
      this.CONVERSATION_PREFIX + conversationId
    );
    return stored ? JSON.parse(stored) : null;
  }

  static saveConversation(conversation: Conversation): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      this.CONVERSATION_PREFIX + conversation.id,
      JSON.stringify(conversation)
    );
  }

  static deleteConversation(conversationId: string): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.CONVERSATION_PREFIX + conversationId);
  }

  static addMessageToConversation(
    conversationId: string,
    message: Message
  ): Conversation | null {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return null;

    conversation.messages.push(message);
    conversation.updatedAt = new Date().toISOString();
    this.saveConversation(conversation);
    return conversation;
  }

  // Utility Methods
  static clearAll(): void {
    if (typeof window === "undefined") return;

    // Clear all reports
    localStorage.removeItem(this.REPORTS_KEY);

    // Clear all conversations
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(this.CONVERSATION_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  static exportData(): {
    reports: Report[];
    conversations: { [key: string]: Conversation };
  } {
    const reports = this.getAllReports();
    const conversations: { [key: string]: Conversation } = {};

    reports.forEach((report) => {
      const conversation = this.getConversation(report.id);
      if (conversation) {
        conversations[report.id] = conversation;
      }
    });

    return { reports, conversations };
  }

  static importData(data: {
    reports: Report[];
    conversations: { [key: string]: Conversation };
  }): void {
    if (typeof window === "undefined") return;

    // Import reports
    localStorage.setItem(this.REPORTS_KEY, JSON.stringify(data.reports));

    // Import conversations
    Object.entries(data.conversations).forEach(([id, conversation]) => {
      this.saveConversation(conversation);
    });
  }

  // Search functionality
  static searchReports(query: string): Report[] {
    const reports = this.getAllReports();
    const lowerQuery = query.toLowerCase();

    return reports.filter(
      (report) =>
        report.ticker.toLowerCase().includes(lowerQuery) ||
        report.contractAddress.toLowerCase().includes(lowerQuery) ||
        (report.projectName &&
          report.projectName.toLowerCase().includes(lowerQuery)) ||
        report.content.toLowerCase().includes(lowerQuery)
    );
  }

  // Get reports sorted by date
  static getReportsSortedByDate(ascending = false): Report[] {
    const reports = this.getAllReports();
    return reports.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }

  // Get conversation statistics
  static getConversationStats(conversationId: string): {
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    firstMessageDate: string | null;
    lastMessageDate: string | null;
  } | null {
    const conversation = this.getConversation(conversationId);
    if (!conversation) return null;

    const userMessages = conversation.messages.filter((m) => m.role === "user");
    const assistantMessages = conversation.messages.filter(
      (m) => m.role === "assistant"
    );

    return {
      messageCount: conversation.messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      firstMessageDate: conversation.messages[0]?.timestamp || null,
      lastMessageDate:
        conversation.messages[conversation.messages.length - 1]?.timestamp ||
        null,
    };
  }

  // Chart/Technical Analysis Navigation State Management
  private static NAVIGATION_STATE_KEY = "navigation_state";

  static getNavigationState(): NavigationState {
    if (typeof window === "undefined") {
      return {
        currentIsViewingChart: false,
        currentTokenAddress: null,
        selectedTokenData: null,
        hasReportOpen: false,
        lastReportId: null,
      };
    }

    const stored = localStorage.getItem(this.NAVIGATION_STATE_KEY);
    return stored
      ? JSON.parse(stored)
      : {
          currentIsViewingChart: false,
          currentTokenAddress: null,
          selectedTokenData: null,
          hasReportOpen: false,
          lastReportId: null,
        };
  }

  static saveNavigationState(state: Partial<NavigationState>): void {
    if (typeof window === "undefined") return;

    const current = this.getNavigationState();
    const updated = { ...current, ...state };
    localStorage.setItem(this.NAVIGATION_STATE_KEY, JSON.stringify(updated));
  }

  static clearNavigationState(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.NAVIGATION_STATE_KEY);
  }
}
