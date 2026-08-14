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
    id: "google/gemini-3.6-flash:online",
    name: "Gemini 3.6 Flash (web search)",
    provider: "google",
    description:
      "Latest Gemini Flash with OpenRouter's web plugin enabled for real-time answers.",
  },
];
