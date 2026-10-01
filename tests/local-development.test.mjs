import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sampleLocal } from "../scripts/local-sample.mjs";
import { portfolioConfig } from "../scripts/cloudflare-config.mjs";

test("only the local command enables local-preview binding semantics", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pkg.scripts["dev:worker"], /--local\s/);
  assert.match(pkg.scripts["dev:worker"], /--var LOCAL_PREVIEW:true/);
  assert.match(pkg.scripts["dev:worker"], /--experimental-new-config/);
  assert.match(pkg.scripts["dev:worker"], /--persist-to \.cloudflare\/state/);
  const migrate = readFileSync("scripts/migrate-local.mjs", "utf8");
  assert.match(migrate, /"--local"/);
  assert.match(migrate, /"--persist-to",\s*"\.cloudflare\/state"/);
  for (const mode of ["development", "production"])
    assert.equal(portfolioConfig(mode).worker.env.LOCAL_PREVIEW.value, "false");
});

test("local sampling uses only Wrangler's loopback endpoint and real current time", async () => {
  let calls = 0;
  await sampleLocal(async (url, options) => {
    calls++;
    assert.equal(
      url,
      "http://127.0.0.1:8787/cdn-cgi/local/scheduled?format=json",
    );
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers, undefined);
    return Response.json({ outcome: "ok", noRetry: false });
  });
  assert.equal(calls, 1);
});

test("local sampling never calls an HTTP error or failed scheduled outcome a success", async () => {
  for (const response of [
    Response.json({ outcome: "ok" }, { status: 500 }),
    Response.json({ outcome: "exception" }),
    Response.json({}),
  ])
    await assert.rejects(
      sampleLocal(async () => response),
      /Local scheduled collection failed/,
    );
});
