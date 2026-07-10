import { useState, type FormEvent } from "react";
import type { AppUser } from "@/lib/api";
import type { CardMetadata, Priority } from "@/lib/kanban";

const initialFormState = {
  title: "",
  details: "",
  dueDate: "",
  labels: "",
  priority: "" as Priority | "",
  assigneeId: "",
};

type NewCardFormProps = {
  users: AppUser[];
  onAdd: (title: string, details: string, metadata: CardMetadata) => void;
};

export const NewCardForm = ({ users, onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onAdd(formState.title.trim(), formState.details.trim(), {
      dueDate: formState.dueDate || null,
      labels: formState.labels
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean),
      priority: formState.priority || null,
      assigneeId: formState.assigneeId ? Number(formState.assigneeId) : null,
    });
    setFormState(initialFormState);
    setIsOpen(false);
  };

  return (
    <div className="mt-4">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Due date
              <input
                type="date"
                value={formState.dueDate}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, dueDate: event.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-sm normal-case text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Priority
              <select
                value={formState.priority}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    priority: event.target.value as Priority | "",
                  }))
                }
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
              value={formState.labels}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, labels: event.target.value }))
              }
              placeholder="urgent, design"
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm normal-case text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Assignee
            <select
              value={formState.assigneeId}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, assigneeId: event.target.value }))
              }
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
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setFormState(initialFormState);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
        >
          Add a card
        </button>
      )}
    </div>
  );
};
