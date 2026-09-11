import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import ts from "typescript";
import { deploy } from "../scripts/deploy.mjs";

const allowed = {
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/develop",
  GITHUB_REPOSITORY: "danielshughes/portfolio",
  CLOUDFLARE_API_TOKEN: "fixture-deploy-credential",
  CLOUDFLARE_ACCOUNT_ID: "fixture-account",
  RADAR_API_TOKEN: "fixture-radar-credential",
  DEPLOY_ENV: "development",
};

test("development deployment rejects untrusted events, branches and missing credentials", () => {
  for (const change of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "pull_request_target" },
    { GITHUB_REF: "refs/heads/main" },
    { GITHUB_REPOSITORY: "example/fork" },
    { CLOUDFLARE_API_TOKEN: "" },
    { CLOUDFLARE_ACCOUNT_ID: "" },
    { RADAR_API_TOKEN: "" },
  ]) {
    let calls = 0;
    assert.throws(
      () =>
        deploy({ ...allowed, ...change }, () => {
          calls++;
          return { status: 0 };
        }),
      /Deployment requires a trusted environment branch push|Missing deployment setting:/,
    );
    assert.equal(calls, 0, "must reject before invoking Wrangler");
  }
});

test("schema migration precedes deployment without exposing the Radar credential", () => {
  deploy(allowed, (_command, args) => {
    assert.match(
      args[3],
      /^env -u RADAR_API_TOKEN node node_modules\/wrangler\/bin\/wrangler.js d1 migrations apply HISTORY --env development --remote && /,
    );
    return { status: 0 };
  });
});

test("only the development secret is streamed to Wrangler, never passed in argv", () => {
  let calls = 0;
  assert.equal(
    deploy(allowed, (command, args, options) => {
      calls++;
      assert.equal(command, "bash");
      assert.deepEqual(args.slice(0, 3), ["-o", "pipefail", "-c"]);
      assert.match(
        args[3],
        /env -u RADAR_API_TOKEN node node_modules\/wrangler\/bin\/wrangler.js deploy --env development --secrets-file \/dev\/stdin$/,
      );
      assert.equal(
        JSON.stringify(args).includes(allowed.RADAR_API_TOKEN),
        false,
      );
      assert.equal(
        options.env.CLOUDFLARE_API_TOKEN,
        allowed.CLOUDFLARE_API_TOKEN,
      );
      assert.equal(options.input, undefined);
      return { status: 0 };
    }),
    0,
  );
  assert.equal(calls, 1);
  assert.equal(
    deploy(allowed, () => ({ status: 7 })),
    7,
  );
  assert.equal(
    deploy(allowed, () => ({ status: null })),
    1,
  );
});

test("actual secret pipeline is readable by pathname on Linux and strips the consumer environment", () => {
  const result = deploy(
    { ...process.env, ...allowed },
    (command, args, options) => {
      const probe = `node -e 'const assert=require("node:assert/strict"); const fs=require("node:fs"); assert.deepEqual(JSON.parse(fs.readFileSync("/dev/stdin", "utf8")), {RADAR_API_TOKEN:"fixture-radar-credential"}); assert.equal(process.env.RADAR_API_TOKEN, undefined);'`;
      const actualArgs = [...args];
      actualArgs[3] = actualArgs[3]
        .replace(
          /^env -u RADAR_API_TOKEN node node_modules\/wrangler\/bin\/wrangler.js d1 migrations apply HISTORY --env development --remote && /,
          "true && ",
        )
        .replace(
          /node node_modules\/wrangler\/bin\/wrangler.js deploy --env development --secrets-file \/dev\/stdin$/,
          probe,
        );
      assert.notEqual(
        actualArgs[3],
        args[3],
        "replace only the real remote consumer",
      );
      return spawnSync(command, actualArgs, { ...options, stdio: "pipe" });
    },
  );
  assert.equal(
    result,
    0,
    "actual OS pipe must be readable without exposing the fixture",
  );
});

test("production requires its matching branch and validated publication origin", () => {
  const production = {
    ...allowed,
    DEPLOY_ENV: "production",
    GITHUB_REF: "refs/heads/main",
    SITE_URL: "https://danhughes.uk",
    PRODUCTION_DEPLOY_ENABLED: "true",
  };
  assert.equal(
    deploy(production, (_command, args) => {
      assert.match(args[3], /--env production /);
      return { status: 0 };
    }),
    0,
  );
  for (const change of [
    { PRODUCTION_DEPLOY_ENABLED: undefined },
    { PRODUCTION_DEPLOY_ENABLED: "false" },
    { DEPLOY_ENV: "staging" },
    { DEPLOY_ENV: undefined },
    { GITHUB_REF: "refs/heads/develop" },
    { SITE_URL: "https://wrong.example" },
    { SITE_URL: undefined },
    { GITHUB_EVENT_NAME: "pull_request" },
  ]) {
    let calls = 0;
    assert.throws(() =>
      deploy({ ...production, ...change }, () => {
        calls++;
        return { status: 0 };
      }),
    );
    assert.equal(calls, 0, "must reject before invoking Wrangler");
  }
});

test("environments route only to their authorised domains", () => {
  const { config, error } = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("wrangler.jsonc", "utf8"),
  );
  assert.equal(error, undefined);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.RADAR_ENABLED, false);
  assert.equal(config.env.development.vars.RADAR_ENABLED, true);
  assert.deepEqual(config.env.development.routes, [
    { pattern: "dev.danhughes.uk", custom_domain: true },
  ]);
  assert.equal(config.env.production.vars.RADAR_ENABLED, true);
  assert.deepEqual(config.env.production.routes, [
    { pattern: "danhughes.uk", custom_domain: true },
  ]);
});

test("Radar attribution survives dynamic loading in a separate static element", () => {
  const markup = readFileSync("src/components/InternetMap.astro", "utf8");
  assert.match(markup, /class="internet-attribution"/);
  assert.match(
    markup,
    /https:\/\/creativecommons.org\/licenses\/by-nc\/4\.0\//,
  );
  assert.match(markup, /Custom visualisation/);
});

test("observability keeps explicit sampled logs and traces with query redaction", () => {
  const { config, error } = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("wrangler.jsonc", "utf8"),
  );
  assert.equal(error, undefined);
  for (const environment of [config.env.development, config.env.production]) {
    const observability = environment.observability ?? config.observability;
    assert.equal(observability.redact_query_string, true);
    assert.deepEqual(observability.logs, {
      enabled: true,
      head_sampling_rate: 0.1,
      invocation_logs: true,
    });
    assert.deepEqual(observability.traces, {
      enabled: true,
      head_sampling_rate: 0.01,
    });
  }
});
