import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function deployDevelopment(env = process.env, run = spawnSync) {
  if (
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REF !== "refs/heads/develop" ||
    env.GITHUB_REPOSITORY !== "danielshughes/portfolio"
  )
    throw new Error("Development deployment requires a trusted develop push");
  for (const name of [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "RADAR_API_TOKEN",
  ])
    if (!env[name]) throw new Error(`Missing deployment setting: ${name}`);

  // A shell pipeline supplies a real OS pipe. Node's piped child stdin is a
  // socket on Linux, which Wrangler cannot reopen through /dev/stdin.
  const result = run(
    "bash",
    [
      "-o",
      "pipefail",
      "-c",
      `node -e 'process.stdout.write(JSON.stringify({RADAR_API_TOKEN:process.env.RADAR_API_TOKEN}))' | env -u RADAR_API_TOKEN node node_modules/wrangler/bin/wrangler.js deploy --env development --secrets-file /dev/stdin`,
    ],
    {
      env: { ...env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
      stdio: "inherit",
    },
  );
  return result.status ?? 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = deployDevelopment();
  } catch {
    // Avoid serialising a child-process error with credential-bearing options.
    console.error(
      "Development deployment failed. Check the trusted deployment settings.",
    );
    process.exitCode = 1;
  }
}
