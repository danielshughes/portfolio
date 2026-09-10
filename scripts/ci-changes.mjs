import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const documentation =
  /^(?:(?:README|AGENTS|CLAUDE|CONTRIBUTING|SECURITY|CODE_OF_CONDUCT)\.md|LICENSE(?:\.md|\.txt)?|src\/assets\/README\.md|docs\/.+\.(?:md|txt|rst))$/;

export function requiresQuality(paths) {
  return paths.some((path) => !documentation.test(path));
}

export function checkChanges(eventName, event, cwd = process.cwd()) {
  const pullRequest = eventName === "pull_request";
  if (!pullRequest && eventName !== "push")
    throw new Error("Unsupported change event");
  const base = pullRequest ? event.pull_request?.base?.sha : event.before;
  const head = pullRequest ? event.pull_request?.head?.sha : event.after;
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? "")))
    throw new Error("Missing or invalid comparison commits");
  if (/^0{40}$/.test(base)) return true;
  const paths = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      `${base}${pullRequest ? "..." : ".."}${head}`,
      "--",
    ],
    { cwd, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  return requiresQuality(paths);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const code = checkChanges(process.env.GITHUB_EVENT_NAME, event);
  appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  console.log(
    code
      ? "Application or configuration changes: full quality checks required."
      : "Documentation only: build, browser tests and deployment skipped.",
  );
}
