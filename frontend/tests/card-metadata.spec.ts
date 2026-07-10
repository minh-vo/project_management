import { expect, test } from "@playwright/test";
import { loginAndCreateBoard, openBoard, waitForBoardSave, type SeededBoard } from "./helpers";

let board: SeededBoard;

test.beforeEach(async ({ page }, testInfo) => {
  const name = `Metadata ${testInfo.testId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  board = await loginAndCreateBoard(page, name);
});

test("card metadata survives a reload", async ({ page }) => {
  await openBoard(page, board);
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Ship the release");
  await column.getByLabel(/due date/i).fill("2026-09-01");
  await column.getByLabel(/priority/i).selectOption("high");
  await column.getByLabel(/labels/i).fill("urgent, launch");
  await column.getByLabel(/assignee/i).selectOption({ label: "user" });

  const saved = waitForBoardSave(page, board.id);
  await column.getByRole("button", { name: /add card/i }).click();
  await saved;

  await page.reload();
  const card = page.getByTestId(/^card-/).filter({ hasText: "Ship the release" });
  await expect(card.getByText("high")).toBeVisible();
  await expect(card.getByText("Due 2026-09-01")).toBeVisible();
  await expect(card.getByText("urgent")).toBeVisible();
  await expect(card.getByText("launch")).toBeVisible();
  await expect(card.getByText("user")).toBeVisible();
});
