import { expect, test, type Page } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  // Reset the persisted board so tests are independent.
  const reset = await page.request.put("/api/board", { data: initialData });
  if (!reset.ok()) {
    throw new Error(`Board reset failed: ${reset.status()}`);
  }
});

const waitForSave = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().includes("/api/board") &&
      response.request().method() === "PUT" &&
      response.ok()
  );

test("added card survives a reload", async ({ page }) => {
  await page.goto("/");
  const column = page.getByTestId("column-col-backlog");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Persistent card");
  const saved = waitForSave(page);
  await column.getByRole("button", { name: /add card/i }).click();
  await saved;

  await page.reload();
  await expect(
    page.getByTestId("column-col-backlog").getByText("Persistent card")
  ).toBeVisible();
});

test("column rename survives a reload", async ({ page }) => {
  await page.goto("/");
  const input = page
    .getByTestId("column-col-backlog")
    .getByLabel("Column title");
  const saved = waitForSave(page);
  await input.fill("Icebox");
  await saved;

  await page.reload();
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue("Icebox");
});

test("card move survives a reload", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const target = page.getByTestId("column-col-review");
  const cardBox = (await card.boundingBox())!;
  const targetBox = (await target.boundingBox())!;

  const saved = waitForSave(page);
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await saved;

  await page.reload();
  await expect(
    page.getByTestId("column-col-review").getByTestId("card-card-1")
  ).toBeVisible();
});

test("card edit survives a reload", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /^edit/i }).click();
  await card.getByLabel("Card title").fill("Edited title");
  await card.getByLabel("Card details").fill("Edited details");
  const saved = waitForSave(page);
  await card.getByRole("button", { name: "Save" }).click();
  await saved;

  await page.reload();
  await expect(page.getByText("Edited title")).toBeVisible();
  await expect(page.getByText("Edited details")).toBeVisible();
});

test("deleted card stays deleted after a reload", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-8");
  const saved = waitForSave(page);
  await card.getByRole("button", { name: /^delete/i }).click();
  await saved;

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kanban Studio" })
  ).toBeVisible();
  await expect(page.getByTestId("card-card-8")).not.toBeVisible();
});
