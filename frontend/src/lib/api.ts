export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.detail ?? response.statusText);
  }
  return response.json();
}

import type { BoardData } from "@/lib/kanban";

export type User = { username: string };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type ChatHistory = { messages: ChatMessage[] };

export type PostChatResponse = { reply: string; board_updated: boolean };

export const me = () => request<User>("/api/me");

export const login = (username: string, password: string) =>
  request<User>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = () =>
  request<{ status: string }>("/api/logout", { method: "POST" });

export const getBoard = () => request<BoardData>("/api/board");

export const putBoard = (board: BoardData) =>
  request<{ status: string }>("/api/board", {
    method: "PUT",
    body: JSON.stringify(board),
  });

export const getChat = () => request<ChatHistory>("/api/chat");

export const postChat = (message: string) =>
  request<PostChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
