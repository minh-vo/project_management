import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LoginForm } from "@/components/LoginForm";
import { ApiError, login } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  login: vi.fn(),
}));

const loginMock = vi.mocked(login);

describe("LoginForm", () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it("submits credentials and calls onSuccess", async () => {
    loginMock.mockResolvedValue({ username: "user" });
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith("user", "password");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows an error on invalid credentials", async () => {
    loginMock.mockRejectedValue(new ApiError(401, "Invalid credentials"));
    const onSuccess = vi.fn();
    render(<LoginForm onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid username or password/i
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
