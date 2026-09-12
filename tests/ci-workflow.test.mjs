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
import { findVerifiedRun } from "../scripts/ci-reuse.mjs";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("local and CI use the declared Node and npm versions", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const node = readFileSync(".nvmrc", "utf8").trim();
  assert.match(node, /^\d+\.\d+\.\d+$/);
  assert.equal(
    pkg.engines.node,
    `>=${node} <${Number(node.split(".")[0]) + 1}`,
  );
  assert.match(pkg.packageManager, /^npm@\d+\.\d+\.\d+$/);
  for (const name of ["quality", "deploy"]) {
    const job = workflow.split(`  ${name}:\n`)[1]?.split(/\n  \w+:\n/)[0];
    assert.ok(job, name);
    assert.match(job, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(job, /node-version:/);
    const bootstrap = job.indexOf('npm install --global "$(node -p');
    assert.ok(bootstrap >= 0, `${name} installs the declared npm`);
    assert.match(job, /require\('\.\/package\.json'\)\.packageManager/);
    assert.ok(bootstrap < job.indexOf("run: npm ci"));
  }
});

test("version updates follow development and keep coupled runtimes together", () => {
  const policy = readFileSync(".github/dependabot.yml", "utf8");
  for (const ecosystem of ["npm", "github-actions"]) {
    const update = policy
      .split(`package-ecosystem: ${ecosystem}\n`)[1]
      ?.split("  - package-ecosystem:")[0];
    assert.ok(update, ecosystem);
    assert.match(update, /target-branch: develop/);
    assert.match(update, /update-types: \["minor", "patch"\]/);
  }
  assert.match(
    policy,
    /cloudflare:\s*\n\s+patterns: \["wrangler", "miniflare"\]/,
  );
});

test("quality runs for pull requests and protected branches only", () => {
  assert.match(
    workflow,
    /on:\s*\n\s+pull_request:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- develop\s*\n\s+- main/,
  );
});

test("failed browser evidence is bounded and excludes hidden files", () => {
  const step = workflow.match(
    /- name: Preserve failed browser evidence\n([\s\S]*?)(?=\n      -|\n  deploy:)/,
  )?.[1];
  assert.ok(step);
  assert.match(
    step,
    /if: failure\(\) && steps\.filter\.outputs\.code == 'true'/,
  );
  assert.match(step, /uses: actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(step, /path: \$\{\{ runner.temp \}\}\/portfolio-test-results/);
  assert.match(step, /retention-days: 3/);
  assert.match(step, /include-hidden-files: false/);
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

test("quality reuse requires a recent complete trusted check of the exact tested tree", async () => {
  const repository = "example/portfolio";
  const testedSha = "b".repeat(40);
  const config = {
    repository,
    runId: "2",
    tree: "c".repeat(40),
    workflow: "d".repeat(40),
    now: Date.parse("2026-09-12T12:00:00Z"),
  };
  const complete = {
    run: {
      id: 1,
      workflow_id: 9,
      run_attempt: 2,
      conclusion: "success",
      event: "pull_request",
      path: ".github/workflows/ci.yml",
      head_sha: "a".repeat(40),
      repository: { full_name: repository },
      head_repository: { full_name: repository },
      created_at: "2026-09-12T10:00:00Z",
    },
    jobs: {
      total_count: 1,
      jobs: [
        {
          name: "quality",
          conclusion: "success",
          steps: [
            { name: `Full quality (${testedSha})`, conclusion: "success" },
            { name: "Dependency audit", conclusion: "success" },
            {
              name: "Redacted secret scan of history and deliverables",
              conclusion: "success",
            },
          ],
        },
      ],
    },
    commit: { tree: { sha: config.tree } },
    definition: { sha: config.workflow },
  };
  async function verify(fixture) {
    return findVerifiedRun({
      ...config,
      api: async (path) => {
        if (path.endsWith("/runs/2")) return { workflow_id: 9 };
        if (path.includes("/workflows/9/runs?"))
          return { workflow_runs: [fixture.run] };
        if (path.endsWith("/runs/1/attempts/2/jobs?per_page=100"))
          return fixture.jobs;
        if (path.endsWith(`/git/commits/${testedSha}`)) return fixture.commit;
        if (
          path.endsWith(
            `/contents/.github/workflows/ci.yml?ref=${fixture.run.head_sha}`,
          )
        )
          return fixture.definition;
        assert.fail(`Unexpected API route: ${path}`);
      },
    });
  }
  assert.deepEqual(await verify(complete), {
    id: 1,
    attempt: 2,
    commit: testedSha,
  });
  for (const mutate of [
    (f) => {
      f.commit.tree.sha = "e".repeat(40);
    },
    (f) => {
      f.definition.sha = "e".repeat(40);
    },
    (f) => {
      f.run.head_repository.full_name = "someone/fork";
    },
    (f) => {
      f.run.event = "workflow_dispatch";
    },
    (f) => {
      f.run.created_at = "2026-09-01T00:00:00Z";
    },
    (f) => {
      f.run.created_at = "invalid";
    },
    (f) => {
      f.run.conclusion = "failure";
    },
    (f) => {
      f.run.workflow_id = 10;
    },
    (f) => {
      f.jobs.jobs[0].steps[0].conclusion = "skipped";
    },
    (f) => {
      f.jobs.jobs[0].steps[1].conclusion = "failure";
    },
    (f) => {
      f.jobs.jobs[0].steps[2].conclusion = "skipped";
    },
    (f) => {
      f.jobs.jobs[0].steps = [];
    },
    (f) => {
      f.jobs.total_count = 2;
    },
  ]) {
    const fixture = structuredClone(complete);
    mutate(fixture);
    assert.equal(await verify(fixture), undefined);
  }
  await assert.rejects(
    findVerifiedRun({
      ...config,
      api: async () => {
        throw new Error("fixture API unavailable");
      },
    }),
    /fixture API unavailable/,
  );
});

test("reuse skips only expensive quality work while audit and deployment retain their gates", () => {
  assert.match(workflow, /name: Full quality \(\$\{\{ github.sha \}\}\)/);
  assert.match(
    workflow,
    /run: npm run quality\n\s+if: steps.filter.outputs.code == 'true' && steps.reuse.outputs.reused != 'true'/,
  );
  assert.match(
    workflow,
    /run: npm audit --package-lock-only --audit-level=low\n\s+if: steps.filter.outputs.code == 'true'\n/,
  );
  const deploy = workflow.split("  deploy:\n")[1];
  assert.doesNotMatch(deploy, /steps.reuse/);
  assert.match(deploy, /run: npm ci/);
  assert.match(deploy, /run: npm run build/);
  assert.match(deploy, /run: node scripts\/deploy.mjs/);
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
