import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import type { Board } from "@/lib/api";

const boards: Board[] = [
  { id: 1, name: "My Board", updated_at: "2026-01-01T00:00:00Z" },
  { id: 2, name: "Second Board", updated_at: "2026-01-02T00:00:00Z" },
];

describe("BoardSwitcher", () => {
  it("renders a tab per board and highlights the active one", () => {
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId={2}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByTestId("board-tab-1")).toHaveTextContent("My Board");
    expect(screen.getByTestId("board-tab-2")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("board-tab-1")).toHaveAttribute("aria-pressed", "false");
  });

  it("selects a board when its tab is clicked", async () => {
    const onSelect = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId={1}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await userEvent.click(screen.getByTestId("board-tab-2"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("creates a new board from the inline form", async () => {
    const onCreate = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId={1}
        onSelect={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText(/new board name/i), "Roadmap");
    await userEvent.keyboard("{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Roadmap");
  });

  it("renames the active board from the inline form", async () => {
    const onRename = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId={1}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /rename board/i }));
    const input = screen.getByLabelText("Board name");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.keyboard("{Enter}");
    expect(onRename).toHaveBeenCalledWith(1, "Renamed");
  });

  it("hides delete when it is the only board", () => {
    render(
      <BoardSwitcher
        boards={[boards[0]]}
        activeBoardId={1}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /delete board/i })
    ).not.toBeInTheDocument();
  });

  it("deletes the active board when more than one exists", async () => {
    const onDelete = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        activeBoardId={2}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(onDelete).toHaveBeenCalledWith(2);
  });
});
