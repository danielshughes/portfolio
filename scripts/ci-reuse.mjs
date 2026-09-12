import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workflowPath = ".github/workflows/ci.yml";
const sha = /^[a-f0-9]{40}$/;

export async function findVerifiedRun({
  api,
  repository,
  runId,
  tree,
  workflow,
  now = Date.now(),
}) {
  const root = `/repos/${repository}`;
  const current = await api(`${root}/actions/runs/${runId}`);
  const since = new Date(now - 7 * 86400000).toISOString();
  const runs = await api(
    `${root}/actions/workflows/${current.workflow_id}/runs?status=success&per_page=20&created=${encodeURIComponent(`>=${since}`)}`,
  );
  for (const run of runs.workflow_runs) {
    if (
      run.id === Number(runId) ||
      run.conclusion !== "success" ||
      !["push", "pull_request"].includes(run.event) ||
      run.path !== workflowPath ||
      run.workflow_id !== current.workflow_id ||
      run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository ||
      !sha.test(run.head_sha) ||
      !Number.isSafeInteger(run.run_attempt) ||
      Date.parse(run.created_at) < Date.parse(since) ||
      !Number.isFinite(Date.parse(run.created_at))
    )
      continue;
    const { jobs, total_count } = await api(
      `${root}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    );
    if (total_count > jobs.length) continue;
    const job = jobs.find(
      ({ name, conclusion }) => name === "quality" && conclusion === "success",
    );
    const full = job?.steps?.find(
      ({ name, conclusion }) =>
        /^Full quality \([a-f0-9]{40}\)$/.test(name) &&
        conclusion === "success",
    );
    if (
      !full ||
      ![
        "Dependency audit",
        "Redacted secret scan of history and deliverables",
      ].every((name) =>
        job.steps.some(
          (step) => step.name === name && step.conclusion === "success",
        ),
      )
    )
      continue;
    const testedSha = full.name.slice(14, -1);
    const tested = await api(`${root}/git/commits/${testedSha}`);
    if (tested.tree.sha !== tree) continue;
    // The step name contains GitHub's immutable github.sha, not script output.
    // Reject a source workflow that could have forged that name or skipped work.
    const definition = await api(
      `${root}/contents/${workflowPath}?ref=${run.head_sha}`,
    );
    if (definition.sha !== workflow) continue;
    return { id: run.id, attempt: run.run_attempt, commit: testedSha };
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let verified;
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
      !/^\d+$/.test(runId ?? "")
    )
      throw new Error("Invalid run context");
    const git = (ref) =>
      execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim();
    if (git("HEAD") !== process.env.GITHUB_SHA)
      throw new Error("Unexpected checkout");
    verified = await findVerifiedRun({
      repository,
      runId,
      tree: git("HEAD^{tree}"),
      workflow: git(`HEAD:${workflowPath}`),
      api: async (path) => {
        const response = await fetch(`https://api.github.com${path}`, {
          headers: {
            authorization: `Bearer ${process.env.GH_TOKEN}`,
            accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("GitHub verification unavailable");
        return response.json();
      },
    });
  } catch {
    console.log(
      "Previous full check could not be verified; running the full suite.",
    );
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `reused=${!!verified}\n`);
  const message = verified
    ? `Reusing full quality from run ${verified.id}, attempt ${verified.attempt}, tested commit ${verified.commit}; the entire Git tree matches. Fresh audit and secret scanning still run.`
    : "No matching successful full check: running the full suite.";
  console.log(message);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}
