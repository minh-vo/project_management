import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Home from "@/app/page";
import { ApiError, getBoard, listBoards, listUsers, me } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  me: vi.fn(),
  logout: vi.fn(),
  listBoards: vi.fn(),
  getBoard: vi.fn(),
  putBoard: vi.fn(),
  listUsers: vi.fn(),
}));

const meMock = vi.mocked(me);
const listBoardsMock = vi.mocked(listBoards);
const getBoardMock = vi.mocked(getBoard);
const listUsersMock = vi.mocked(listUsers);

describe("Home auth gate", () => {
  beforeEach(() => {
    localStorage.clear();
    meMock.mockReset();
    listBoardsMock
      .mockReset()
      .mockResolvedValue([{ id: 1, name: "My Board", updated_at: "2026-01-01T00:00:00Z" }]);
    getBoardMock.mockReset().mockResolvedValue(structuredClone(initialData));
    listUsersMock.mockReset().mockResolvedValue([{ id: 1, username: "user" }]);
  });

  it("shows the login form when not authenticated", async () => {
    meMock.mockRejectedValue(new ApiError(401, "Not authenticated"));
    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("shows the board when authenticated", async () => {
    meMock.mockResolvedValue({ username: "user" });
    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /log out/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/signed in as user/i)).toBeInTheDocument();
  });
});
