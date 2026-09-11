import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { checkChanges, requiresQuality } from "../scripts/ci-changes.mjs";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("quality runs for pull requests and protected branches only", () => {
  assert.match(
    workflow,
    /on:\s*\n\s+pull_request:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- develop\s*\n\s+- main/,
  );
});

test("documentation-only changes still receive the redacted history secret scan", () => {
  const step = workflow.match(
    /- name: Redacted secret scan of history and deliverables\n([\s\S]*?)(?=\n  deploy:)/,
  )?.[1];
  assert.ok(step, "secret scanning is part of the required quality job");
  assert.doesNotMatch(step, /if: steps\.filter/);
  assert.match(step, /gitleaks\" git --redact=100/);
});

test("delivery is environment-scoped and protected branch deployments are not cancelled", () => {
  assert.match(
    workflow,
    /concurrency:\s*\n\s+group: [^\n]+\n\s+queue: max\n\s+cancel-in-progress: false/,
  );
  assert.match(
    workflow,
    /name: \$\{\{ github.ref == 'refs\/heads\/main' && 'production' \|\| 'development' \}\}/,
  );
  assert.match(
    workflow,
    /DEPLOY_ENV: \$\{\{ github.ref == 'refs\/heads\/main' && 'production' \|\| 'development' \}\}/,
  );
  assert.match(workflow, /SITE_URL: https:\/\/danhughes.uk/);
  assert.doesNotMatch(workflow, /dev\.dlhs\.co\.uk|deploy-development\.mjs/);
  assert.match(workflow, /needs\.quality\.outputs\.code == 'true'/);
});

test("documentation can skip checks but mixed and unknown files require them", () => {
  const docs = [
    "README.md",
    "AGENTS.md",
    "src/assets/README.md",
    "docs/deployment.md",
  ];
  assert.equal(requiresQuality(docs), false);
  for (const path of [
    "tsconfig.json",
    ".github/workflows/ci.yml",
    ".github/dependabot.yml",
    "src/content/article.md",
    "public/guide.md",
    "docs/example.js",
    "new-config.json",
    "README.md\nsrc/app.ts",
  ])
    assert.equal(requiresQuality([...docs, path]), true, path);
});

test("missing comparisons fail and new branches require full checks", () => {
  assert.throws(() => checkChanges("push", {}), /comparison commits/);
  assert.throws(() => checkChanges("schedule", {}), /Unsupported/);
  assert.equal(
    checkChanges("push", { before: "0".repeat(40), after: "a".repeat(40) }),
    true,
  );
});

test("real Git ranges handle documentation, renames and a moving PR base", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "portfolio-ci-changes-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=CI fixture",
        "-c",
        "user.email=ci@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  git("init", "-q");
  writeFileSync(join(cwd, "README.md"), "Documentation\n");
  writeFileSync(join(cwd, "tsconfig.json"), "{}\n");
  const base = commit();
  writeFileSync(join(cwd, "README.md"), "Updated documentation\n");
  const docs = commit();
  assert.equal(checkChanges("push", { before: base, after: docs }, cwd), false);
  mkdirSync(join(cwd, "docs"));
  renameSync(join(cwd, "tsconfig.json"), join(cwd, "docs/types.md"));
  const renamed = commit();
  assert.equal(
    checkChanges("push", { before: docs, after: renamed }, cwd),
    true,
  );
  git("checkout", "-qb", "moving-base", base);
  writeFileSync(join(cwd, "tsconfig.json"), '{"strict":true}\n');
  const movingBase = commit();
  assert.equal(
    checkChanges(
      "pull_request",
      { pull_request: { base: { sha: movingBase }, head: { sha: docs } } },
      cwd,
    ),
    false,
  );
});
