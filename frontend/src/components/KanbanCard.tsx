import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { AppUser } from "@/lib/api";
import type { Card, CardMetadata, Priority } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  users: AppUser[];
  onEdit: (cardId: string, title: string, details: string, metadata: CardMetadata) => void;
  onDelete: (cardId: string) => void;
};

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-[var(--surface)] text-[var(--gray-text)]",
  medium: "bg-[rgba(32,157,215,0.12)] text-[var(--primary-blue)]",
  high: "bg-[rgba(217,84,60,0.12)] text-[#d9543c]",
};

export const KanbanCard = ({ card, users, onEdit, onDelete }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    details: "",
    dueDate: "",
    labels: "",
    priority: "" as Priority | "",
    assigneeId: "",
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const assignee = users.find((user) => user.id === card.assigneeId);

  const startEditing = () => {
    setDraft({
      title: card.title,
      details: card.details,
      dueDate: card.dueDate ?? "",
      labels: (card.labels ?? []).join(", "),
      priority: card.priority ?? "",
      assigneeId: card.assigneeId ? String(card.assigneeId) : "",
    });
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    onEdit(card.id, draft.title.trim(), draft.details.trim(), {
      dueDate: draft.dueDate || null,
      labels: draft.labels
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
      priority: draft.priority || null,
      assigneeId: draft.assigneeId ? Number(draft.assigneeId) : null,
    });
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, title: event.target.value }))
            }
            aria-label="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
            autoFocus
          />
          <textarea
            value={draft.details}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, details: event.target.value }))
            }
            aria-label="Card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Due date
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, dueDate: event.target.value }))
                }
                aria-label="Due date"
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-sm normal-case text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Priority
              <select
                value={draft.priority}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    priority: event.target.value as Priority | "",
                  }))
                }
                aria-label="Priority"
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-sm normal-case text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Labels
            <input
              value={draft.labels}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, labels: event.target.value }))
              }
              aria-label="Labels"
              placeholder="urgent, design"
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm normal-case text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Assignee
            <select
              value={draft.assigneeId}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, assigneeId: event.target.value }))
              }
              aria-label="Assignee"
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-sm normal-case text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
              {card.details}
            </p>
            {(card.dueDate || card.priority || assignee || (card.labels && card.labels.length > 0)) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {card.priority && (
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      PRIORITY_STYLES[card.priority]
                    )}
                  >
                    {card.priority}
                  </span>
                )}
                {card.dueDate && (
                  <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                    Due {card.dueDate}
                  </span>
                )}
                {assignee && (
                  <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                    {assignee.username}
                  </span>
                )}
                {card.labels?.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-[rgba(117,57,145,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--secondary-purple)]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--stroke)]"
              aria-label={`Edit ${card.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
              aria-label={`Delete ${card.title}`}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
