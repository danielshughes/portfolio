import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function deploy(env = process.env, run = spawnSync) {
  const environment = env.DEPLOY_ENV;
  const branch =
    environment === "development"
      ? "develop"
      : environment === "production"
        ? "main"
        : undefined;
  if (
    !branch ||
    env.GITHUB_EVENT_NAME !== "push" ||
    env.GITHUB_REF !== `refs/heads/${branch}` ||
    env.GITHUB_REPOSITORY !== "danielshughes/portfolio"
  )
    throw new Error("Deployment requires a trusted environment branch push");
  if (environment === "production" && env.SITE_URL !== "https://danhughes.uk")
    throw new Error("Production requires the approved publication origin");
  if (environment === "production" && env.PRODUCTION_DEPLOY_ENABLED !== "true")
    throw new Error("Production deployment is on hold");
  for (const name of [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "RADAR_API_TOKEN",
    "TURNSTILE_SECRET_KEY",
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
      `env -u RADAR_API_TOKEN -u TURNSTILE_SECRET_KEY node node_modules/wrangler/bin/wrangler.js d1 migrations apply HISTORY --env ${environment} --remote && node -e 'process.stdout.write(JSON.stringify({RADAR_API_TOKEN:process.env.RADAR_API_TOKEN,TURNSTILE_SECRET_KEY:process.env.TURNSTILE_SECRET_KEY}))' | env -u RADAR_API_TOKEN -u TURNSTILE_SECRET_KEY node node_modules/wrangler/bin/wrangler.js deploy --env ${environment} --secrets-file /dev/stdin`,
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
    process.exitCode = deploy();
  } catch {
    // Avoid serialising a child-process error with credential-bearing options.
    console.error("Deployment failed. Check the trusted deployment settings.");
    process.exitCode = 1;
  }
}
