import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${PORT}/`,
  },
  projects: [
    // WebKit is the engine of the iPhone's WebView: the closest thing to the
    // real app that runs on Windows.
    { name: "iphone-webkit", use: { ...devices["iPhone 14"] } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
