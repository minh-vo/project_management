import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { getBoard, putBoard } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getBoard: vi.fn(),
  putBoard: vi.fn(),
}));

const getBoardMock = vi.mocked(getBoard);
const putBoardMock = vi.mocked(putBoard);

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
      within(column).getByRole("button", { name: "Save", exact: true })
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
      within(column).getByRole("button", { name: "Cancel", exact: true })
    );
    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(within(column).queryByText("Discarded")).not.toBeInTheDocument();
  });

  it("does not save on initial load", async () => {
    await renderBoard();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(putBoardMock).not.toHaveBeenCalled();
  });
});
