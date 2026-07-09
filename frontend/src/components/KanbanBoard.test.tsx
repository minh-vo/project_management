import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { getBoard, getChat, postChat, putBoard } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBoard: vi.fn(),
  putBoard: vi.fn(),
  getChat: vi.fn(),
  postChat: vi.fn(),
}));

const getBoardMock = vi.mocked(getBoard);
const putBoardMock = vi.mocked(putBoard);
const getChatMock = vi.mocked(getChat);
const postChatMock = vi.mocked(postChat);

const renderBoard = async () => {
  render(<KanbanBoard />);
  await screen.findAllByTestId(/column-/i);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const waitForSave = () =>
  waitFor(() => expect(putBoardMock).toHaveBeenCalled(), { timeout: 2000 });

describe("KanbanBoard", () => {
  beforeEach(() => {
    getBoardMock.mockReset().mockResolvedValue(structuredClone(initialData));
    putBoardMock.mockReset().mockResolvedValue({ status: "ok" });
    getChatMock.mockReset().mockResolvedValue({ messages: [] });
    postChatMock.mockReset();
  });

  it("loads the board from the API and renders five columns", async () => {
    await renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(getBoardMock).toHaveBeenCalled();
  });

  it("renames a column and saves", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");

    await waitForSave();
    const saved = putBoardMock.mock.calls.at(-1)![0];
    expect(saved.columns[0].title).toBe("New Name");
  });

  it("adds and removes a card, saving each time", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/details/i),
      "Notes"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );
    expect(within(column).getByText("New card")).toBeInTheDocument();

    await waitForSave();
    const saved = putBoardMock.mock.calls.at(-1)![0];
    expect(
      Object.values(saved.cards).some((card) => card.title === "New card")
    ).toBe(true);

    await userEvent.click(
      within(column).getByRole("button", { name: /delete new card/i })
    );
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("edits a card and saves", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );

    const titleInput = within(column).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(column).getByLabelText("Card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    await userEvent.click(
      within(column).getByRole("button", { name: "Save" })
    );

    expect(within(column).getByText("Updated title")).toBeInTheDocument();
    expect(within(column).getByText("Updated details")).toBeInTheDocument();

    await waitForSave();
    const saved = putBoardMock.mock.calls.at(-1)![0];
    expect(saved.cards["card-1"].title).toBe("Updated title");
    expect(saved.cards["card-1"].details).toBe("Updated details");
  });

  it("cancelling an edit keeps the original card", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const titleInput = within(column).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Discarded");
    await userEvent.click(
      within(column).getByRole("button", { name: "Cancel" })
    );
    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("does not save on initial load", async () => {
    await renderBoard();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(putBoardMock).not.toHaveBeenCalled();
  });

  it("shows an error banner when saving fails, and clears it on the next successful save", async () => {
    putBoardMock.mockReset().mockRejectedValueOnce(new Error("network"));
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");

    await waitForSave();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t save your last change/i
    );

    putBoardMock.mockResolvedValueOnce({ status: "ok" });
    await userEvent.type(input, "!");
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });

  it("does not lose an in-progress edit when an AI board update arrives", async () => {
    await renderBoard();

    // Start a rename (dirty, debounce pending) but don't wait for the save.
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");

    // While that edit is still pending, the AI chat delivers a board update.
    // If the refresh it triggers clobbers local state, the rename above
    // would silently disappear and never reach putBoard.
    postChatMock.mockResolvedValue({ reply: "Done.", board_updated: true });
    await userEvent.click(screen.getByTestId("chat-toggle"));
    await waitFor(() => expect(getChatMock).toHaveBeenCalled());
    await userEvent.type(screen.getByTestId("chat-input"), "do something");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(postChatMock).toHaveBeenCalled());

    // The in-progress rename must survive, and getBoard must not have been
    // called again (a refresh here would only be safe once the rename saves).
    expect(input).toHaveValue("New Name");
    expect(getBoardMock).toHaveBeenCalledTimes(1);

    await waitForSave();
    const saved = putBoardMock.mock.calls.at(-1)![0];
    expect(saved.columns[0].title).toBe("New Name");
  });
});
