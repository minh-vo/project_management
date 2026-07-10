"use client";

import { useState, type FormEvent } from "react";
import type { Board } from "@/lib/api";

type BoardSwitcherProps = {
  boards: Board[];
  activeBoardId: number;
  onSelect: (boardId: number) => void;
  onCreate: (name: string) => void;
  onRename: (boardId: number, name: string) => void;
  onDelete: (boardId: number) => void;
};

export const BoardSwitcher = ({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const activeBoard = boards.find((board) => board.id === activeBoardId);

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (trimmed) {
      onCreate(trimmed);
    }
    setNewName("");
    setCreating(false);
  };

  const startRename = () => {
    if (!activeBoard) return;
    setRenameValue(activeBoard.name);
    setRenaming(true);
  };

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = renameValue.trim();
    if (trimmed && activeBoard) {
      onRename(activeBoard.id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      data-testid="board-switcher"
      className="flex items-center gap-3 rounded-full border border-[var(--stroke)] bg-white/80 px-4 py-2 shadow-[var(--shadow)] backdrop-blur"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => onSelect(board.id)}
            data-testid={`board-tab-${board.id}`}
            aria-pressed={board.id === activeBoardId}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              board.id === activeBoardId
                ? "bg-[var(--secondary-purple)] text-white"
                : "text-[var(--gray-text)] hover:text-[var(--primary-blue)]"
            }`}
          >
            {board.name}
          </button>
        ))}
        {creating ? (
          <form onSubmit={submitCreate} className="shrink-0">
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onBlur={submitCreate}
              placeholder="Board name"
              aria-label="New board name"
              className="w-32 rounded-full border border-[var(--primary-blue)] px-3 py-1 text-xs font-medium normal-case text-[var(--navy-dark)] outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="shrink-0 rounded-full border border-dashed border-[var(--stroke)] px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          >
            + New board
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {renaming ? (
          <form onSubmit={submitRename}>
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={submitRename}
              aria-label="Board name"
              className="w-32 rounded-full border border-[var(--primary-blue)] px-3 py-1 text-xs font-medium normal-case text-[var(--navy-dark)] outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={startRename}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--primary-blue)]"
          >
            Rename board
          </button>
        )}
        {boards.length > 1 && (
          <button
            type="button"
            onClick={() => onDelete(activeBoardId)}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-600"
          >
            Delete board
          </button>
        )}
      </div>
    </div>
  );
};
