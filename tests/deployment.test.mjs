import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { convertToWranglerConfig } from "@cloudflare/config";
import { portfolioConfig } from "../scripts/cloudflare-config.mjs";
import { deploy } from "../scripts/deploy.mjs";

const allowed = {
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/develop",
  GITHUB_REPOSITORY: "danielshughes/portfolio",
  CLOUDFLARE_API_TOKEN: "fixture-deploy-credential",
  CLOUDFLARE_ACCOUNT_ID: "fixture-account",
  RADAR_API_TOKEN: "fixture-radar-credential",
  TURNSTILE_SECRET_KEY: "fixture-turnstile-credential",
  DEPLOY_ENV: "development",
};
const configFor = (mode) => convertToWranglerConfig(portfolioConfig(mode));
const migration = (mode) =>
  `env -u RADAR_API_TOKEN -u TURNSTILE_SECRET_KEY node node_modules/cf/bin/cf d1 migrations apply ${portfolioConfig(mode).worker.env.HISTORY.id} --dir worker/migrations --mode ${mode} && `;

test("development deployment rejects untrusted events, branches and missing credentials", () => {
  for (const change of [
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_EVENT_NAME: "pull_request_target" },
    { GITHUB_REF: "refs/heads/main" },
    { GITHUB_REPOSITORY: "example/fork" },
    { CLOUDFLARE_API_TOKEN: "" },
    { CLOUDFLARE_ACCOUNT_ID: "" },
    { RADAR_API_TOKEN: "" },
    { TURNSTILE_SECRET_KEY: "" },
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
    assert.equal(calls, 0, "must reject before invoking cf");
  }
});

test("schema migration precedes deployment without exposing runtime credentials", () => {
  deploy(allowed, (_command, args) => {
    assert.ok(args[3].startsWith(migration("development")));
    return { status: 0 };
  });
});

test("only environment-scoped runtime secrets are streamed to cf, never passed in argv", () => {
  let calls = 0;
  assert.equal(
    deploy(allowed, (command, args, options) => {
      calls++;
      assert.equal(command, "bash");
      assert.deepEqual(args.slice(0, 3), ["-o", "pipefail", "-c"]);
      assert.match(
        args[3],
        /env -u RADAR_API_TOKEN -u TURNSTILE_SECRET_KEY node node_modules\/cf\/bin\/cf deploy --prebuilt --mode development --secrets-file \/dev\/stdin$/,
      );
      assert.equal(
        JSON.stringify(args).includes(allowed.RADAR_API_TOKEN),
        false,
      );
      assert.equal(
        JSON.stringify(args).includes(allowed.TURNSTILE_SECRET_KEY),
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
      const probe = `node -e 'const assert=require("node:assert/strict"); const fs=require("node:fs"); assert.deepEqual(JSON.parse(fs.readFileSync("/dev/stdin", "utf8")), {RADAR_API_TOKEN:"fixture-radar-credential",TURNSTILE_SECRET_KEY:"fixture-turnstile-credential"}); assert.equal(process.env.RADAR_API_TOKEN, undefined); assert.equal(process.env.TURNSTILE_SECRET_KEY, undefined);'`;
      const actualArgs = [...args];
      actualArgs[3] = actualArgs[3]
        .replace(migration("development"), "true && ")
        .replace(
          /node node_modules\/cf\/bin\/cf deploy --prebuilt --mode development --secrets-file \/dev\/stdin$/,
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
      assert.match(args[3], /--mode production /);
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
    assert.equal(calls, 0, "must reject before invoking cf");
  }
});

test("environments route only to their authorised domains", () => {
  const development = configFor("development");
  const production = configFor("production");
  for (const config of [development, production]) {
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.cache, { enabled: false });
    assert.equal(config.exports.default.cache.enabled, false);
    assert.equal(config.exports.RadarData.cache.enabled, true);
    assert.equal(config.exports.CoordinationRoom.storage, "sqlite");
    assert.equal(config.vars.RADAR_NATIVE_CACHE, true);
    assert.equal(config.vars.RADAR_ENABLED, true);
  }
  assert.deepEqual(development.routes, [
    { pattern: "dev.danhughes.uk", custom_domain: true },
  ]);
  assert.deepEqual(production.routes, [
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

test("Radar queues are isolated by environment with bounded consumption and no paid CPU override", () => {
  for (const name of ["development", "production"]) {
    const config = configFor(name);
    assert.equal(config.limits?.cpu_ms, undefined);
    const { producers, consumers } = config.queues;
    assert.equal(producers.length, 1);
    assert.equal(consumers.length, 1);
    assert.equal(producers[0].binding, "RADAR_COLLECTION_QUEUE");
    assert.equal(producers[0].queue, consumers[0].queue);
    assert.equal(producers[0].queue, `portfolio-radar-${name}`);
    assert.notEqual(producers[0].remote, true);
    assert.equal(consumers[0].max_batch_size, 1);
    assert.equal(consumers[0].max_batch_timeout, 0);
    assert.equal(consumers[0].max_concurrency, 1);
    assert.equal(consumers[0].max_retries, 0);
    assert.equal(consumers[0].dead_letter_queue, undefined);
  }
});

test("both environments retain invocation logs with sampled traces and redacted queries", () => {
  for (const mode of ["development", "production"]) {
    const observability = configFor(mode).observability;
    assert.equal(observability.redact_query_string, true);
    assert.deepEqual(observability.logs, {
      enabled: true,
      head_sampling_rate: 1,
      invocation_logs: true,
    });
    assert.deepEqual(observability.traces, {
      enabled: true,
      head_sampling_rate: 0.01,
    });
  }
});

test("migration preserves deployed resource identities and controls", () => {
  // Frozen rollback configuration is compared once, not used by active commands.
  const { config: legacy, error } = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    readFileSync("wrangler.jsonc", "utf8"),
  );
  assert.equal(error, undefined);
  for (const mode of ["development", "production"]) {
    const migrated = configFor(mode);
    const previous = { ...legacy, ...legacy.env[mode] };
    for (const field of [
      "name",
      "compatibility_date",
      "compatibility_flags",
      "workers_dev",
      "preview_urls",
      "cache",
      "vars",
      "observability",
      "ratelimits",
      "triggers",
      "queues",
      "routes",
      "kv_namespaces",
      "ai",
      "version_metadata",
    ])
      assert.deepEqual(migrated[field], previous[field], `${mode}.${field}`);
    assert.equal(resolve(migrated.main), resolve(previous.main));
    assert.equal(
      migrated.d1_databases[0].database_id,
      previous.d1_databases[0].database_id,
    );
    assert.equal(
      migrated.d1_databases[0].database_name,
      previous.d1_databases[0].database_name,
    );
    assert.equal(
      migrated.durable_objects.bindings[0].class_name,
      previous.durable_objects.bindings[0].class_name,
    );
    assert.equal(
      migrated.durable_objects.bindings[0].script_name,
      previous.name,
    );
    assert.deepEqual(migrated.exports.CoordinationRoom, {
      type: "durable-object",
      storage: "sqlite",
    });
    assert.equal(
      migrated.migrations,
      undefined,
      "must not replay legacy migration tags",
    );
  }
  assert.throws(() => portfolioConfig("staging"), /mode must be/);
});
