import { defineConfig, devices } from "@playwright/test";

/**
 * Mobile-first: the primary project is a 360px viewport, because that is what
 * judges and school representatives actually bring to a venue. Desktop runs
 * alongside it to catch anything the mobile work broke.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        // 360px is narrower than the Pixel 5 default and matches the low-end
        // Android phones the league runs on.
        viewport: { width: 360, height: 740 },
      },
    },
    {
      name: "mobile-landscape",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 740, height: 360 },
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
