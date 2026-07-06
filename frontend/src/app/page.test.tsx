import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Home from "@/app/page";
import { ApiError, getBoard, me } from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  me: vi.fn(),
  logout: vi.fn(),
  getBoard: vi.fn(),
  putBoard: vi.fn(),
}));

const meMock = vi.mocked(me);
const getBoardMock = vi.mocked(getBoard);

describe("Home auth gate", () => {
  beforeEach(() => {
    meMock.mockReset();
    getBoardMock.mockReset().mockResolvedValue(structuredClone(initialData));
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
  });
});
