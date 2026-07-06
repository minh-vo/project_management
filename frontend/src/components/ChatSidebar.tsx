"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getChat, postChat, type ChatMessage } from "@/lib/api";

type ChatSidebarProps = {
  open: boolean;
  onToggle: () => void;
  onBoardUpdated: () => void;
};

export const ChatSidebar = ({
  open,
  onToggle,
  onBoardUpdated,
}: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoadingHistory(true);
    setError(null);
    getChat()
      .then((data) => setMessages(data.messages))
      .catch(() => setError("Could not load chat history."))
      .finally(() => setLoadingHistory(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [open, messages, pending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || pending) {
      return;
    }

    setInput("");
    setPending(true);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, created_at: new Date().toISOString() },
    ]);

    try {
      const result = await postChat(text);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reply,
          created_at: new Date().toISOString(),
        },
      ]);
      if (result.board_updated) {
        onBoardUpdated();
      }
    } catch {
      setError("Message failed to send. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="chat-toggle"
        onClick={onToggle}
        className="fixed bottom-8 right-6 z-20 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-[var(--shadow)] transition hover:brightness-110"
      >
        AI Chat
      </button>
    );
  }

  return (
    <aside
      data-testid="chat-sidebar"
      className="sticky top-0 flex h-screen w-[380px] shrink-0 flex-col border-l border-[var(--stroke)] bg-white/95 shadow-[var(--shadow)] backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Assistant
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">
            Board Chat
          </h2>
        </div>
        <button
          type="button"
          data-testid="chat-toggle"
          onClick={onToggle}
          aria-label="Close chat"
          className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
        >
          Close
        </button>
      </header>

      <div
        data-testid="chat-messages"
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        {loadingHistory && (
          <p className="text-sm text-[var(--gray-text)]">Loading history...</p>
        )}
        {!loadingHistory && messages.length === 0 && (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask the assistant to create, edit, or move cards on your board.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.created_at}-${index}`}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === "user"
                  ? "bg-[var(--primary-blue)] text-white"
                  : "border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {pending && (
          <p className="text-sm font-medium text-[var(--gray-text)]">
            Assistant is typing...
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p role="alert" className="px-5 pb-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--stroke)] px-5 py-4"
      >
        <label className="sr-only" htmlFor="chat-input">
          Message
        </label>
        <textarea
          id="chat-input"
          data-testid="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your board..."
          rows={3}
          disabled={pending}
          className="w-full resize-none rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Sending..." : "Send"}
        </button>
      </form>
    </aside>
  );
};
