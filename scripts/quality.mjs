import { spawnSync } from "node:child_process";
const selection = process.env.PORTFOLIO_BROWSERS;
if (process.env.CI && selection)
  throw new Error("CI must run every configured browser");
const browsers = selection?.split(",");
if (
  browsers?.some(
    (browser) => !["chromium", "firefox", "webkit"].includes(browser),
  )
)
  throw new Error("Unknown browser selection");
for (const script of [
  "format:check",
  "lint",
  "check",
  "test",
  "test:environment",
  "test:runtime",
  "build:dev",
]) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Root cf build detects Astro, which does not emit our custom API Worker.
// Use cf's native Wrangler bundler protocol, then validate both deployment modes.
for (const mode of ["development", "production"]) {
  for (const args of [
    [
      "node_modules/wrangler/bin/wrangler.js",
      "build",
      "--experimental-new-config",
      "--experimental-cf-build-output",
      "--env",
      mode,
    ],
    [
      "node_modules/cf/bin/cf",
      "deploy",
      "--prebuilt",
      "--mode",
      mode,
      "--dry-run",
    ],
  ]) {
    const result = spawnSync(process.execPath, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        CF_SEND_TELEMETRY: "false",
        WRANGLER_SEND_METRICS: "false",
      },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
const browser = spawnSync(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    ...(browsers?.map((name) => `--project=${name}`) ?? []),
  ],
  { stdio: "inherit" },
);
process.exit(browser.status ?? 1);
