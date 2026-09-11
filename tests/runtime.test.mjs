import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./runtime-harness.mjs";

const summary = {
  success: true,
  result: {
    summary_0: { mobile: "60", desktop: "40" },
    meta: {
      normalization: "PERCENTAGE",
      dateRange: [
        { startTime: "2026-09-03T14:00:00Z", endTime: "2026-09-10T14:00:00Z" },
      ],
      lastUpdated: "2026-09-10T14:00:00Z",
      confidenceInfo: { level: null, annotations: [] },
    },
  },
};
test("workerd serves generated static policies and protected API errors", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  for (const path of [
    "/",
    "/notes/",
    "/experiments/",
    "/robots.txt",
    "/api/unknown",
    "/api/radar?country=UNKNOWN",
  ]) {
    const response = await mf.dispatchFetch("https://portfolio.example" + path);
    assert.equal(response.headers.get("x-frame-options"), "DENY", path);
    assert.equal(
      response.headers.get("x-robots-tag"),
      "noindex, nofollow",
      path,
    );
    assert.match(
      response.headers.get("content-security-policy"),
      /object-src 'none'/,
    );
  }
});
test("workerd real bindings cache success and enforce cold admission before fetch", async (t) => {
  let calls = 0;
  const mf = await runtime({
    limits: { RADAR_UPSTREAM: 1 },
    outbound(request) {
      calls++;
      assert.equal(new URL(request.url).origin, "https://api.cloudflare.com");
      assert.equal(request.headers.get("cookie"), null);
      assert.equal(
        request.headers.get("authorization"),
        "Bearer explicitly-fake-runtime-fixture",
      );
      return Response.json(summary);
    },
  });
  t.after(() => mf.dispose());
  const fetch = (country) =>
    mf.dispatchFetch(
      `https://portfolio.example/api/radar?country=${country}&view=bots`,
      { headers: { cookie: "fake-browser-session=1" } },
    );
  assert.equal((await fetch("GB")).status, 200);
  assert.equal((await fetch("GB")).status, 200);
  assert.equal((await fetch("JP")).status, 429);
  assert.equal(calls, 1);
});
test("workerd caches non-429 backoff across countries", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound() {
      calls++;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => mf.dispose());
  for (const country of ["GB", "JP", "US"])
    assert.equal(
      (
        await mf.dispatchFetch(
          `https://portfolio.example/api/radar?country=${country}`,
        )
      ).status,
      502,
    );
  assert.equal(calls, 1);
});

test("development caches in D1 behind Access, ignores request host and expires entries", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound() {
      calls++;
      return Response.json(summary);
    },
  });
  t.after(() => mf.dispose());
  const request = (host) =>
    mf.dispatchFetch(`https://${host}/api/radar?country=GB&view=devices`);
  assert.equal((await request("portfolio.example")).status, 200);
  const db = await mf.getD1Database("HISTORY");
  const row = await db.prepare("SELECT * FROM radar_cache").first();
  assert.equal(row.key, "/api/.radar/v2/GB/devices");
  assert.equal((await request("other.example")).status, 200);
  assert.equal(calls, 1);
  await db.prepare("UPDATE radar_cache SET expires=0").run();
  assert.equal((await request("portfolio.example")).status, 200);
  assert.equal(calls, 2);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM radar_cache").first())
      .count,
    1,
  );
});
test("workerd ingress binding limits invalid requests", async (t) => {
  const mf = await runtime({ limits: { RADAR_INGRESS: 1 } });
  t.after(() => mf.dispose());
  assert.equal(
    (
      await mf.dispatchFetch(
        "https://portfolio.example/api/radar?country=invalid",
      )
    ).status,
    400,
  );
  assert.equal(
    (await mf.dispatchFetch("https://portfolio.example/api/radar?country=GB"))
      .status,
    429,
  );
});

test("development retains long upstream rate-limit backoff across countries", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound() {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "retry-after": "7200" },
      });
    },
  });
  t.after(() => mf.dispose());
  for (const country of ["GB", "JP"]) {
    const response = await mf.dispatchFetch(
      `https://portfolio.example/api/radar?country=${country}`,
    );
    assert.equal(response.status, 429);
    assert(Number(response.headers.get("retry-after")) > 3600);
  }
  assert.equal(calls, 1);
});
