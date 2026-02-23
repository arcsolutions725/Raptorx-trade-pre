// Utility functions for localStorage sync

const STORAGE_KEY = "claw-v5-chats";

export interface Chat {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
}

export function getChatsFromStorage(): Chat[] {
  if (typeof window === "undefined") return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Error reading chats from localStorage:", error);
    return [];
  }
}

export function saveChatsToStorage(chats: Chat[]): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (error) {
    console.error("Error saving chats to localStorage:", error);
  }
}

export function getChatFromStorage(chatId: string): Chat | null {
  const chats = getChatsFromStorage();
  return chats.find((chat) => chat.id === chatId) || null;
}

export function saveChatToStorage(chat: Chat): void {
  const chats = getChatsFromStorage();
  const index = chats.findIndex((c) => c.id === chat.id);
  
  if (index >= 0) {
    chats[index] = chat;
  } else {
    chats.push(chat);
  }
  
  // Sort by updatedAt descending
  chats.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  
  saveChatsToStorage(chats);
}

export function deleteChatFromStorage(chatId: string): void {
  const chats = getChatsFromStorage();
  const filtered = chats.filter((chat) => chat.id !== chatId);
  saveChatsToStorage(filtered);
}

