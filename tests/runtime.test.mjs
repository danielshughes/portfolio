import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./runtime-harness.mjs";
import { radarUpstream } from "./fixtures/radar-upstream.mjs";
import { developmentCache } from "../worker/radar-cache.ts";

test("a D1 response expiring during its read is a miss, not a zero-TTL success", async (t) => {
  let now = 10000;
  t.mock.method(Date, "now", () => now);
  const cache = developmentCache({
    prepare() {
      return {
        bind() {
          return {
            async first() {
              now = 12000;
              return {
                body: "{}",
                headers: JSON.stringify([
                  ["cache-control", "public, max-age=3600"],
                ]),
                expires: 11000,
              };
            },
          };
        },
      };
    },
  });
  assert.equal(
    await cache.match("https://radar.internal/api/.radar/v2/GB/bots"),
    undefined,
  );
});

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

test("native Radar loopback keeps ingress checks and does not duplicate successful D1 caching", async (t) => {
  let calls = 0;
  const mf = await runtime({
    bindings: { RADAR_NATIVE_CACHE: true },
    limits: { RADAR_INGRESS: 2 },
    outbound(request) {
      calls++;
      assert.equal(request.headers.get("cookie"), null);
      return Response.json(summary);
    },
  });
  t.after(() => mf.dispose());
  const response = await mf.dispatchFetch(
    "https://portfolio.example/api/radar?country=GB&view=bots",
    { headers: { cookie: "fixture=1" } },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /must-revalidate/);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await response.json()).country, "GB");
  assert.equal(
    (await mf.dispatchFetch("https://portfolio.example/api/radar?country=XX"))
      .status,
    400,
  );
  assert.equal(
    (
      await mf.dispatchFetch(
        "https://portfolio.example/api/radar?country=GB&view=bots",
      )
    ).status,
    429,
  );
  assert.equal(calls, 1);
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM radar_cache").first())
      .count,
    0,
  );
});

test("native Radar misses preserve shared provider backoff and never cache errors as successes", async (t) => {
  let calls = 0;
  const mf = await runtime({
    bindings: { RADAR_NATIVE_CACHE: true },
    outbound() {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "retry-after": "60" },
      });
    },
  });
  t.after(() => mf.dispose());
  for (const country of ["GB", "JP"]) {
    const response = await mf.dispatchFetch(
      `https://portfolio.example/api/radar?country=${country}&view=bots`,
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 1);
});
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

test("both environment caches round-trip every supported view and reject inherited names", async (t) => {
  for (const environment of ["development", "production"])
    await t.test(environment, async (t) => {
      let calls = 0;
      const mf = await runtime({
        bindings: { SITE_ENV: environment },
        outbound(request) {
          calls++;
          return radarUpstream(request.url);
        },
      });
      t.after(() => mf.dispose());
      const request = (view) =>
        mf.dispatchFetch(
          `https://portfolio.example/api/radar?country=GB&view=${view}`,
        );
      for (const view of ["traffic", "bots", "devices", "protocols"]) {
        const first = await request(view);
        assert.equal(first.status, 200);
        const data = await first.json();
        assert.equal(data.view, view);
        const cached = await request(view);
        assert.equal(cached.status, 200);
        assert.deepEqual(await cached.json(), data);
      }
      for (const view of ["unknown", "__proto__", "constructor", "toString"])
        assert.equal((await request(view)).status, 400);
      assert.equal(calls, 5);
      const db = await mf.getD1Database("HISTORY");
      const rows = (
        await db.prepare("SELECT key FROM radar_cache ORDER BY key").all()
      ).results;
      assert.equal(rows.length, environment === "development" ? 4 : 0);
      if (environment === "development")
        assert.deepEqual(
          rows.map((row) => row.key),
          [
            "/api/.radar/v2/GB/bots",
            "/api/.radar/v2/GB/devices",
            "/api/.radar/v2/GB/protocols",
            "/api/.radar/v2/GB/traffic",
          ],
        );
    });
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
  await db
    .prepare("UPDATE radar_cache SET expires=?")
    .bind(Date.now() + 15000)
    .run();
  const ageing = await request("portfolio.example");
  const seconds = Number(
    ageing.headers.get("cache-control").match(/max-age=(\d+)/)?.[1],
  );
  assert.ok(
    seconds > 0 && seconds <= 15,
    "cache reads must not restart a full browser TTL",
  );
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
