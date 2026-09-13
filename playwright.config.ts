import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const outputDir =
  process.env.PLAYWRIGHT_OUTPUT_DIR ||
  join(
    homedir(),
    "scratch",
    new Date().toISOString().slice(0, 10),
    "portfolio",
    "test-results",
  );
// macOS 27 protects Firefox's personal app data even with a temporary -profile.
// Keep test startup metadata separate: https://bugzilla.mozilla.org/show_bug.cgi?id=2060476
const firefoxEnv =
  process.platform === "darwin"
    ? {
        ...process.env,
        MOZ_APP_DATA: join(outputDir, "..", "firefox-app-data"),
      }
    : undefined;
if (firefoxEnv) mkdirSync(firefoxEnv.MOZ_APP_DATA, { recursive: true });

export default defineConfig({
  workers: 4,
  testDir: "./tests/visual",
  outputDir,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      use: { browserName: "firefox", launchOptions: { env: firefoxEnv } },
    },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: { baseURL: "http://127.0.0.1:4322" },
  webServer: {
    command: "node scripts/browser-server.mjs",
    url: "http://127.0.0.1:4322",
    reuseExistingServer: false,
  },
});
