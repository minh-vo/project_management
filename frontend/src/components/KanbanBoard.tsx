"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { getBoard, listUsers, putBoard, type AppUser, type Board } from "@/lib/api";
import { createId, moveCard, type BoardData, type CardMetadata } from "@/lib/kanban";

const SAVE_DEBOUNCE_MS = 400;

// closestCorners alone can resolve drops to cards in neighboring columns when
// the pointer is in the empty lower area of a short column, so prefer whatever
// droppable the pointer is actually inside.
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  return closestCorners(args);
};

type KanbanBoardProps = {
  boardId: number;
  boards: Board[];
  onSelectBoard: (boardId: number) => void;
  onCreateBoard: (name: string) => void;
  onRenameBoard: (boardId: number, name: string) => void;
  onDeleteBoard: (boardId: number) => void;
  username?: string | null;
  onLogout?: () => void;
};

export const KanbanBoard = ({
  boardId,
  boards,
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  username,
  onLogout,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const isDirty = useRef(false);
  const isSaving = useRef(false);

  useEffect(() => {
    listUsers().then(setUsers).catch(console.error);
  }, []);

  // A server refresh (e.g. after an AI chat update) must not clobber an
  // edit that hasn't been saved yet, or one whose save is in flight —
  // otherwise it would silently disappear instead of being persisted.
  const refreshBoard = useCallback(() => {
    if (isDirty.current || isSaving.current) {
      return;
    }
    getBoard(boardId).then(setBoard).catch(console.error);
  }, [boardId]);

  useEffect(() => {
    getBoard(boardId).then(setBoard).catch(console.error);
  }, [boardId]);

  // Persist edits, debounced. isDirty distinguishes user edits from the
  // initial load (and from server refreshes, e.g. after AI updates later).
  useEffect(() => {
    if (!board || !isDirty.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      isDirty.current = false;
      isSaving.current = true;
      putBoard(boardId, board)
        .then(() => setSaveError(false))
        .catch((error) => {
          console.error(error);
          setSaveError(true);
        })
        .finally(() => {
          isSaving.current = false;
        });
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [board, boardId]);

  const updateBoard = (updater: (prev: BoardData) => BoardData) => {
    isDirty.current = true;
    setBoard((prev) => (prev ? updater(prev) : prev));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    updateBoard((prev) => ({
      ...prev,
      columns: moveCard(prev.columns, active.id as string, over.id as string),
    }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (
    columnId: string,
    title: string,
    details: string,
    metadata: CardMetadata
  ) => {
    const id = createId("card");
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet.", ...metadata },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleEditCard = (
    cardId: string,
    title: string,
    details: string,
    metadata: CardMetadata
  ) => {
    updateBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { ...prev.cards[cardId], title, details, ...metadata },
      },
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    updateBoard((prev) => {
      return {
        ...prev,
        cards: Object.fromEntries(
          Object.entries(prev.cards).filter(([id]) => id !== cardId)
        ),
        columns: prev.columns.map((column) =>
          column.id === columnId
            ? {
                ...column,
                cardIds: column.cardIds.filter((id) => id !== cardId),
              }
            : column
        ),
      };
    });
  };

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
          Loading board...
        </p>
      </main>
    );
  }

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="flex min-h-screen">
      <div className="relative min-w-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        {saveError && (
          <p
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600"
          >
            Couldn&apos;t save your last change. Check your connection — we&apos;ll keep
            retrying as you make edits.
          </p>
        )}
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-3">
                {username && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                    Signed in as {username}
                  </span>
                )}
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                  >
                    Log out
                  </button>
                )}
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>
          <BoardSwitcher
            boards={boards}
            activeBoardId={boardId}
            onSelect={onSelectBoard}
            onCreate={onCreateBoard}
            onRename={onRenameBoard}
            onDelete={onDeleteBoard}
          />
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                users={users}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onEditCard={handleEditCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      </div>
      <ChatSidebar
        boardId={boardId}
        open={chatOpen}
        onToggle={() => setChatOpen((prev) => !prev)}
        onBoardUpdated={refreshBoard}
      />
    </div>
  );
};
