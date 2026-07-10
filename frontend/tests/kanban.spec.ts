import { expect, test } from "@playwright/test";
import { loginAndCreateBoard, openBoard, type SeededBoard } from "./helpers";

let board: SeededBoard;

test.beforeEach(async ({ page }, testInfo) => {
  const name = `Kanban ${testInfo.testId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  board = await loginAndCreateBoard(page, name);
});

test("loads the kanban board", async ({ page }) => {
  await openBoard(page, board);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await openBoard(page, board);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("drops a card into the empty lower area of a short column", async ({
  page,
}) => {
  // Regression: closestCorners used to resolve this drop to a card in a
  // neighboring taller column, bouncing the card back to its origin.
  await openBoard(page, board);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-discovery");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  const viewport = page.viewportSize();
  const dropY = Math.min(
    columnBox.y + columnBox.height - 40,
    (viewport?.height ?? 720) - 10
  );

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(columnBox.x + columnBox.width / 2, dropY, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await openBoard(page, board);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});
