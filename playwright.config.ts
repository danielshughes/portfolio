import { defineConfig } from "@playwright/test";
import { homedir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  workers: 4,
  testDir: "./tests/visual",
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ||
    join(
      homedir(),
      "scratch",
      new Date().toISOString().slice(0, 10),
      "portfolio",
      "test-results",
    ),
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:4322" },
  webServer: {
    command: "node scripts/browser-server.mjs",
    url: "http://127.0.0.1:4322",
    reuseExistingServer: false,
  },
});
