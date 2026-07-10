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
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

import type { BoardData } from "@/lib/kanban";

export type User = { username: string };

export type Board = { id: number; name: string; updated_at: string };

export type AppUser = { id: number; username: string };

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

export const listUsers = () => request<AppUser[]>("/api/users");

export const listBoards = () => request<Board[]>("/api/boards");

export const createBoard = (name: string) =>
  request<Board>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const renameBoard = (boardId: number, name: string) =>
  request<Board>(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const deleteBoard = (boardId: number) =>
  request<void>(`/api/boards/${boardId}`, { method: "DELETE" });

export const getBoard = (boardId: number) =>
  request<BoardData>(`/api/boards/${boardId}`);

export const putBoard = (boardId: number, board: BoardData) =>
  request<{ status: string }>(`/api/boards/${boardId}`, {
    method: "PUT",
    body: JSON.stringify(board),
  });

export const getChat = (boardId: number) =>
  request<ChatHistory>(`/api/boards/${boardId}/chat`);

export const postChat = (boardId: number, message: string) =>
  request<PostChatResponse>(`/api/boards/${boardId}/chat`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
