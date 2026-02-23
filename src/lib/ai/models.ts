export const DEFAULT_CHAT_MODEL = "google/gemini-3-flash-preview";  //google/gemini-2.0-flash-001

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "google/gemini-2.0-flash-001",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    description:
      "Lightweight reasoning model in the Gemini 2.5 family, optimized for ultra-low latency and cost efficiency.",
  },
  {
    id: "openai/gpt-4o-mini-search-preview",
    name: "GPT-4o-mini Search Preview",
    provider: "openai",
    description:
      "GPT-4o mini Search Preview is a specialized model for web search in Chat Completions",
  },
];
