import { expect, test } from "@playwright/test";
import { loginAndCreateBoard, openBoard, pickBoard, type SeededBoard } from "./helpers";

let board: SeededBoard;
let uniqueSuffix: string;

test.beforeEach(async ({ page }, testInfo) => {
  uniqueSuffix = `${testInfo.testId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  board = await loginAndCreateBoard(page, `Switcher ${uniqueSuffix}`);
});

test("creates a board and switches to it", async ({ page }) => {
  await openBoard(page, board);
  const switcher = page.getByTestId("board-switcher");
  const newBoardName = `Fresh ${uniqueSuffix}`;

  await switcher.getByRole("button", { name: /new board/i }).click();
  await switcher.getByLabel(/new board name/i).fill(newBoardName);
  await switcher.getByLabel(/new board name/i).press("Enter");

  await expect(switcher.getByRole("button", { name: newBoardName })).toBeVisible();
  await expect(
    switcher.getByRole("button", { name: newBoardName })
  ).toHaveAttribute("aria-pressed", "true");
  // A freshly created board has the fixed columns but no cards.
  await expect(page.getByTestId("card-card-1")).not.toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("switching boards does not leak cards between them", async ({ page }) => {
  await openBoard(page, board);
  const switcher = page.getByTestId("board-switcher");
  const siblingName = `Empty Sibling ${uniqueSuffix}`;

  await switcher.getByRole("button", { name: /new board/i }).click();
  await switcher.getByLabel(/new board name/i).fill(siblingName);
  await switcher.getByLabel(/new board name/i).press("Enter");
  await expect(page.getByTestId("card-card-1")).not.toBeVisible();

  await pickBoard(page, board);
  await expect(page.getByTestId("card-card-1")).toBeVisible();
});

test("renames the active board", async ({ page }) => {
  await openBoard(page, board);
  const switcher = page.getByTestId("board-switcher");
  const renamedName = `Renamed ${uniqueSuffix}`;

  await switcher.getByRole("button", { name: /rename board/i }).click();
  await switcher.getByLabel("Board name").fill(renamedName);
  await switcher.getByLabel("Board name").press("Enter");

  await expect(switcher.getByRole("button", { name: renamedName })).toBeVisible();
});

test("deletes a board and falls back to another one", async ({ page }) => {
  await openBoard(page, board);
  const switcher = page.getByTestId("board-switcher");
  const doomedName = `Doomed ${uniqueSuffix}`;

  await switcher.getByRole("button", { name: /new board/i }).click();
  await switcher.getByLabel(/new board name/i).fill(doomedName);
  await switcher.getByLabel(/new board name/i).press("Enter");
  await expect(switcher.getByRole("button", { name: doomedName })).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await switcher.getByRole("button", { name: /delete board/i }).click();
  await expect(switcher.getByRole("button", { name: doomedName })).not.toBeVisible();
  await expect(switcher.getByRole("button", { name: board.name, exact: true })).toBeVisible();
});
