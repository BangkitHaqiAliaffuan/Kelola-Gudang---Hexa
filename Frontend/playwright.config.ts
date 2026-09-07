import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "off",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: "playwright/.auth/user.json",
      },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 812 },
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
  webServer: [
    {
      command: "php artisan serve --host=127.0.0.1 --port=8000",
      cwd: "../Backend",
      url: "http://127.0.0.1:8000/up",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: "http://localhost:8080",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
