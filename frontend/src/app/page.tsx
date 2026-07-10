"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import {
  createBoard,
  deleteBoard,
  listBoards,
  logout,
  me,
  renameBoard,
  type Board,
} from "@/lib/api";

type AuthState = "loading" | "anonymous" | "authenticated";

const LAST_BOARD_KEY = "pm:lastBoardId";

function pickDefaultBoardId(boards: Board[]): number | null {
  if (boards.length === 0) {
    return null;
  }
  const stored = Number(localStorage.getItem(LAST_BOARD_KEY));
  if (boards.some((board) => board.id === stored)) {
    return stored;
  }
  const mostRecentlyUpdated = [...boards].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  )[0];
  return mostRecentlyUpdated.id;
}

export default function Home() {
  const [auth, setAuth] = useState<AuthState>("loading");
  const [username, setUsername] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);

  useEffect(() => {
    me()
      .then((user) => {
        setUsername(user.username);
        setAuth("authenticated");
      })
      .catch(() => setAuth("anonymous"));
  }, []);

  useEffect(() => {
    if (auth !== "authenticated") {
      return;
    }
    listBoards().then((list) => {
      setBoards(list);
      setBoardId(pickDefaultBoardId(list));
    });
  }, [auth]);

  const selectBoard = (id: number) => {
    setBoardId(id);
    localStorage.setItem(LAST_BOARD_KEY, String(id));
  };

  const handleCreateBoard = (name: string) => {
    createBoard(name).then((board) => {
      setBoards((prev) => [...prev, board]);
      selectBoard(board.id);
    });
  };

  const handleRenameBoard = (id: number, name: string) => {
    renameBoard(id, name).then((updated) => {
      setBoards((prev) => prev.map((board) => (board.id === id ? updated : board)));
    });
  };

  const handleDeleteBoard = (id: number) => {
    deleteBoard(id).then(() => {
      const remaining = boards.filter((board) => board.id !== id);
      setBoards(remaining);
      if (boardId === id) {
        const fallback = pickDefaultBoardId(remaining);
        if (fallback !== null) {
          selectBoard(fallback);
        } else {
          setBoardId(null);
        }
      }
    });
  };

  if (auth === "loading" || (auth === "authenticated" && boardId === null)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading...
        </p>
      </main>
    );
  }

  if (auth === "anonymous") {
    return (
      <LoginForm
        onSuccess={(user) => {
          setUsername(user.username);
          setAuth("authenticated");
        }}
      />
    );
  }

  return (
    <KanbanBoard
      boardId={boardId as number}
      boards={boards}
      onSelectBoard={selectBoard}
      onCreateBoard={handleCreateBoard}
      onRenameBoard={handleRenameBoard}
      onDeleteBoard={handleDeleteBoard}
      username={username}
      onLogout={async () => {
        await logout();
        setAuth("anonymous");
      }}
    />
  );
}
