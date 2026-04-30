import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  timeout: 120_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4273",
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 4273 --strictPort",
      url: "http://127.0.0.1:4273",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm exec tsx scripts/start-playwright-sync-node.ts",
      url: "http://127.0.0.1:4110/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
