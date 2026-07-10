import { expect, type Page } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

export type SeededBoard = { id: number; name: string };

/** Log in and create a uniquely-named board seeded with the demo data, isolated from other tests. */
export async function loginAndCreateBoard(page: Page, name: string): Promise<SeededBoard> {
  const login = await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  if (!login.ok()) {
    throw new Error(`Login failed: ${login.status()}`);
  }
  const created = await page.request.post("/api/boards", { data: { name } });
  if (!created.ok()) {
    throw new Error(`Board creation failed: ${created.status()}`);
  }
  const board = await created.json();
  const seeded = await page.request.put(`/api/boards/${board.id}`, { data: initialData });
  if (!seeded.ok()) {
    throw new Error(`Board seed failed: ${seeded.status()}`);
  }
  return { id: board.id as number, name };
}

/**
 * Select a board by name in the already-loaded app (also remembers it via
 * localStorage). The switcher's aria-pressed flips synchronously on click,
 * before the new board's KanbanBoard instance has fetched its data — a plain
 * click-then-assert-aria-pressed can return control while the previous
 * board's identically-testid'd DOM is still mid-unmount, so a subsequent
 * interaction can land on the wrong board. Waiting for this board's own GET
 * to resolve avoids that window; skip the wait if it's already the active tab.
 */
export async function pickBoard(page: Page, board: SeededBoard) {
  const tab = page
    .getByTestId("board-switcher")
    .getByRole("button", { name: board.name, exact: true });
  if ((await tab.getAttribute("aria-pressed")) === "true") {
    return;
  }
  const loaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/boards/${board.id}` &&
      response.request().method() === "GET" &&
      response.ok()
  );
  await tab.click();
  await loaded;
  await expect(tab).toHaveAttribute("aria-pressed", "true");
}

/** Navigate to the app and select the given board. */
export async function openBoard(page: Page, board: SeededBoard) {
  await page.goto("/");
  await pickBoard(page, board);
}

/**
 * Wait for a successful save of this specific board. Scoped by id because
 * under parallel test execution a same-shaped PUT to a different board could
 * otherwise satisfy an unscoped wait before this test's own debounced save fires.
 */
export function waitForBoardSave(page: Page, boardId: number) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/boards/${boardId}` &&
      response.request().method() === "PUT" &&
      response.ok()
  );
}
