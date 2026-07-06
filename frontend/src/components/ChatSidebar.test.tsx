import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import { getChat, postChat } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getChat: vi.fn(),
  postChat: vi.fn(),
}));

const getChatMock = vi.mocked(getChat);
const postChatMock = vi.mocked(postChat);

describe("ChatSidebar", () => {
  const onToggle = vi.fn();
  const onBoardUpdated = vi.fn();

  beforeEach(() => {
    getChatMock.mockReset().mockResolvedValue({
      messages: [
        {
          role: "user",
          content: "Hello",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          role: "assistant",
          content: "Hi there",
          created_at: "2026-01-01T00:00:01Z",
        },
      ],
    });
    postChatMock.mockReset().mockResolvedValue({
      reply: "Done.",
      board_updated: false,
    });
    onToggle.mockReset();
    onBoardUpdated.mockReset();
  });

  it("shows a toggle button when closed", () => {
    render(
      <ChatSidebar
        open={false}
        onToggle={onToggle}
        onBoardUpdated={onBoardUpdated}
      />
    );
    expect(screen.getByTestId("chat-toggle")).toHaveTextContent(/ai chat/i);
  });

  it("loads and renders history when opened", async () => {
    render(
      <ChatSidebar open onToggle={onToggle} onBoardUpdated={onBoardUpdated} />
    );

    await waitFor(() => expect(getChatMock).toHaveBeenCalled());
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("sends a message and appends the assistant reply", async () => {
    render(
      <ChatSidebar open onToggle={onToggle} onBoardUpdated={onBoardUpdated} />
    );
    await waitFor(() => expect(getChatMock).toHaveBeenCalled());

    await userEvent.type(screen.getByTestId("chat-input"), "Add a card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(postChatMock).toHaveBeenCalledWith("Add a card");
    await waitFor(() =>
      expect(screen.getByText("Done.")).toBeInTheDocument()
    );
  });

  it("refreshes the board when the response includes a board update", async () => {
    postChatMock.mockResolvedValue({
      reply: "Card added.",
      board_updated: true,
    });
    render(
      <ChatSidebar open onToggle={onToggle} onBoardUpdated={onBoardUpdated} />
    );
    await waitFor(() => expect(getChatMock).toHaveBeenCalled());

    await userEvent.type(screen.getByTestId("chat-input"), "add card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(onBoardUpdated).toHaveBeenCalled());
  });

  it("shows an error when sending fails", async () => {
    postChatMock.mockRejectedValue(new Error("network"));
    render(
      <ChatSidebar open onToggle={onToggle} onBoardUpdated={onBoardUpdated} />
    );
    await waitFor(() => expect(getChatMock).toHaveBeenCalled());

    await userEvent.type(screen.getByTestId("chat-input"), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /message failed to send/i
    );
  });
});
