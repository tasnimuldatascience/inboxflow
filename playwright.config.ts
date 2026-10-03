import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec tsx apps/api/src/main.ts",
      url: "http://localhost:4001/api/health",
      timeout: 60000,
      reuseExistingServer: false,
      env: {
        API_PORT: "4001",
        APP_URL: "http://localhost:3001",
        PUBLIC_API_URL: "http://localhost:4001",
        DATA_DIR: ":memory:",
        DATABASE_URL: "",
        S3_ENDPOINT: "",
        REDIS_URL: "",
        NODE_ENV: "test",
        DEMO_MODE: "true",
      },
    },
    {
      command: "pnpm --filter @inboxflow/web dev --port 3001",
      url: "http://localhost:3001",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        API_INTERNAL_URL: "http://127.0.0.1:4001",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
