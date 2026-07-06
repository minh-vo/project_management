import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// E2E tests run against the FastAPI-served static build (same shape as the
// Docker deployment). If the app container is already running on port 8000,
// tests reuse it; otherwise the frontend is built and served via uvicorn.
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build && uv run --project ../backend uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8000",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      STATIC_DIR: path.resolve(__dirname, "out"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
