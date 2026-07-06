import { expect, test } from "@playwright/test";
import { initialData } from "../src/lib/kanban";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/login", {
    data: { username: "user", password: "password" },
  });
  const reset = await page.request.put("/api/board", { data: initialData });
  if (!reset.ok()) {
    throw new Error(`Board reset failed: ${reset.status()}`);
  }
});

test("opens the chat sidebar and shows history", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          messages: [
            {
              role: "user",
              content: "Earlier question",
              created_at: "2026-01-01T00:00:00Z",
            },
            {
              role: "assistant",
              content: "Earlier answer",
              created_at: "2026-01-01T00:00:01Z",
            },
          ],
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-sidebar")).toBeVisible();
  await expect(page.getByText("Earlier question")).toBeVisible();
  await expect(page.getByText("Earlier answer")).toBeVisible();
});

test("shows a new card on the board after an AI board update", async ({
  page,
}) => {
  const updatedBoard = structuredClone(initialData);
  updatedBoard.cards["card-ai"] = {
    id: "card-ai",
    title: "AI created card",
    details: "Added from chat",
  };
  updatedBoard.columns[0].cardIds.push("card-ai");

  let boardGets = 0;
  await page.route("**/api/board", async (route) => {
    if (route.request().method() === "GET") {
      boardGets += 1;
      if (boardGets > 1) {
        await route.fulfill({ json: updatedBoard });
        return;
      }
    }
    await route.continue();
  });

  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { reply: "Added the card to Backlog.", board_updated: true },
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByTestId("chat-toggle").click();
  await page.getByTestId("chat-input").fill("add a card called AI created card");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(
    page.getByTestId("column-col-backlog").getByText("AI created card")
  ).toBeVisible();
});

test("closes the sidebar without breaking the board layout", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await page.getByTestId("chat-toggle").click();
  await expect(page.getByTestId("chat-sidebar")).toBeVisible();
  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByTestId("chat-sidebar")).not.toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});
