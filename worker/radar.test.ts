import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRadar } from "./radar.ts";

const now = Date.parse("2026-09-10T14:00:00Z");
const start = now - 7 * 86400000;
const iso = (n: number) => new Date(n).toISOString();
const fixture = () => ({
  success: true,
  result: {
    serie_0: {
      timestamps: Array.from({ length: 168 }, (_, i) =>
        iso(start + i * 3600000),
      ),
      values: Array.from({ length: 168 }, () => "0.5"),
    },
    meta: {
      normalization: "MIN0_MAX",
      aggInterval: "ONE_HOUR",
      dateRange: [{ startTime: iso(start), endTime: iso(now) }],
      lastUpdated: iso(now),
      confidenceInfo: { level: null, annotations: [] },
    },
  },
});
const outage = () => ({
  id: "example",
  eventType: "OUTAGE",
  locations: ["GB"],
  startDate: iso(start + 3600000),
  endDate: null,
  description: "Authored test event",
  scope: "ASN",
});
const summaryFixture = () => ({
  success: true,
  result: {
    summary_0: { mobile: "53.701641", desktop: "46.298288", other: "7.1e-05" },
    meta: { ...fixture().result.meta, normalization: "PERCENTAGE" },
  },
});

test("summary views use isolated country/view caches and percentage units", async () => {
  const h = harness(() => Response.json(summaryFixture()));
  for (const [view, dimension] of [
    ["bots", "BOT_CLASS"],
    ["devices", "DEVICE_TYPE"],
    ["protocols", "HTTP_VERSION"],
  ]) {
    const response = await h.run(`country=JP&view=${view}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.country, "JP");
    assert.equal(data.view, view);
    assert.equal(data.categories[2].value, 0.000071);
    assert.ok(h.calls.at(-1)!.pathname.endsWith(dimension));
    assert.equal(h.calls.at(-1)!.searchParams.get("location"), "JP");
    await h.run(`country=JP&view=${view}`);
  }
  assert.equal(h.calls.length, 3);
  await h.run("country=GB&view=devices");
  assert.equal(h.calls.length, 4);
});
test("rejects unsupported and duplicate views before fetching", async () => {
  const h = harness();
  for (const q of [
    "country=GB&view=secrets",
    "country=GB&view=constructor",
    "country=GB&view=__proto__",
    "country=GB&view=toString",
    "country=GB&view=bots&view=devices",
    "country=GB&view=bots&extra=1",
  ])
    assert.equal((await h.run(q)).status, 400);
  assert.equal(h.calls.length, 0);
});
test("rejects malformed summary percentages instead of inventing a breakdown", async () => {
  for (const value of ["NaN", "101", "-1", "", "0x30", "40"]) {
    const h = harness(() => {
      const body = summaryFixture();
      body.result.summary_0.mobile = value;
      return Response.json(body);
    });
    assert.equal((await h.run("country=GB&view=devices")).status, 502);
  }
});
function harness(
  reply?: (url: URL, init: RequestInit) => Response | Promise<Response>,
) {
  let clock = now;
  const calls: URL[] = [];
  const records = new Map<string, { response: Response; until: number }>();
  const options = {
    enabled: true,
    ingress: { limit: async () => ({ success: true }) },
    upstream: { limit: async () => ({ success: true }) },
    token: "test-only-placeholder",
    now: () => clock,
    fetch: async (url: string, init: RequestInit) => {
      const parsed = new URL(url);
      calls.push(parsed);
      assert.equal(parsed.origin, "https://api.cloudflare.com");
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal);
      return reply
        ? reply(parsed, init)
        : Response.json(
            parsed.pathname.endsWith("/outages")
              ? { success: true, result: { annotations: [] } }
              : fixture(),
          );
    },
    cache: {
      async match(key: string) {
        const record = records.get(key);
        return record && record.until > clock
          ? record.response.clone()
          : undefined;
      },
      async put(key: string, response: Response) {
        records.set(key, {
          response: response.clone(),
          until:
            clock +
            Number(
              response.headers
                .get("cache-control")
                ?.match(/max-age=(\d+)/)?.[1] ?? 0,
            ) *
              1000,
        });
      },
    },
  };
  return {
    options,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    run: (query = "country=GB", method = "GET") =>
      handleRadar(
        new Request("https://portfolio.example/api/radar?" + query, { method }),
        options,
      ),
  };
}

test("non-429 failures back off across countries and expire after 30 seconds", async () => {
  for (const network of [false, true]) {
    const h = harness(() => {
      if (network) throw new TypeError("fetch failed");
      return new Response(null, { status: 503 });
    });
    assert.equal((await h.run()).status, 502);
    for (let i = 0; i < 4; i++) {
      const response = await h.run("country=JP&view=bots");
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("retry-after"), "30");
    }
    assert.equal(h.calls.length, 1);
    h.advance(30_001);
    await h.run();
    assert.equal(h.calls.length, 2);
  }
});

test("ingress and cold admissions reject without upstream work", async () => {
  for (const binding of ["ingress", "upstream"] as const) {
    const h = harness();
    h.options[binding].limit = async () => ({ success: false });
    assert.equal((await h.run()).status, 429);
    assert.equal(h.calls.length, 0);
    h.options[binding].limit = async () => {
      throw new Error("unavailable");
    };
    assert.equal((await h.run()).status, 503);
    assert.equal(h.calls.length, 0);
    const missing = { ...h.options, [binding]: undefined };
    assert.equal(
      (
        await handleRadar(
          new Request("https://portfolio.example/api/radar?country=GB"),
          missing,
        )
      ).status,
      503,
    );
  }
});

test("cached success survives other-country backoff and needs no cold admission", async () => {
  let fail = false;
  const h = harness(() =>
    fail
      ? new Response(null, { status: 503 })
      : Response.json(summaryFixture()),
  );
  assert.equal((await h.run("country=GB&view=bots")).status, 200);
  fail = true;
  assert.equal((await h.run("country=JP&view=bots")).status, 502);
  h.options.upstream.limit = async () => ({ success: false });
  assert.equal((await h.run("country=GB&view=bots")).status, 200);
  assert.equal(h.calls.length, 2);
});

test("disabled and missing credentials do not call Radar", async () => {
  const h = harness();
  h.options.enabled = false;
  assert.equal((await h.run()).status, 503);
  h.options.enabled = true;
  h.options.token = "";
  assert.equal((await h.run()).status, 503);
  assert.equal(h.calls.length, 0);
});

test("cache read/write failures never return success or continue upstream", async () => {
  const read = harness();
  read.options.cache.match = async () => {
    throw new Error("unavailable");
  };
  assert.equal((await read.run()).status, 502);
  assert.equal(read.calls.length, 0);
  const write = harness();
  write.options.cache.put = async () => {
    throw new Error("unavailable");
  };
  assert.equal((await write.run()).status, 502);
  const corrupt = harness();
  corrupt.options.cache.match = async (key) =>
    key.endsWith("backoff")
      ? new Response(null, { headers: { "x-retry-at": "invalid" } })
      : undefined;
  assert.equal((await corrupt.run()).status, 502);
  assert.equal(corrupt.calls.length, 0);
});

test("does not follow upstream redirects or forward credentials to another origin", async () => {
  const h = harness(
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.org/" },
      }),
  );
  assert.equal((await h.run()).status, 502);
  assert.equal(h.calls.length, 1);
});
test("accepts only GET and one supported country", async () => {
  const h = harness();
  assert.equal((await h.run("country=GB", "POST")).status, 405);
  for (const q of [
    "",
    "country=ZZ",
    "country=gb",
    "country=GB&country=US",
    "country=GB&url=https://example.org",
  ])
    assert.equal((await h.run(q)).status, 400);
  assert.equal(h.calls.length, 0);
});
test("validates Radar data, normalises ratios and keeps unknown confidence", async () => {
  const h = harness();
  const response = await h.run();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.mode, "radar");
  assert.equal(data.country, "GB");
  assert.equal(data.values.length, 168);
  assert.equal(data.values[0], 50);
  assert.equal(data.confidence.level, null);
  assert.equal(data.updatedAt, iso(now));
  assert.equal(data.fetchedAt, iso(now));
  assert.deepEqual(data.outages, []);
  assert.equal(data.outagesTruncated, false);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].searchParams.get("aggInterval"), "1h");
  assert.equal(h.calls[1].searchParams.get("dateStart"), iso(start));
});
test("missing hours remain null, not zero or interpolated", async () => {
  const h = harness((url) => {
    const data = fixture();
    data.result.serie_0.timestamps.splice(7, 1);
    data.result.serie_0.values.splice(7, 1);
    return Response.json(
      url.pathname.endsWith("/outages")
        ? { success: true, result: { annotations: [] } }
        : data,
    );
  });
  const response = await h.run();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.values[7], null);
  assert.equal(data.values[8], 50);
});
test("reported events retain scope and unknown end, without inferring national outages", async () => {
  const h = harness((url) =>
    Response.json(
      url.pathname.endsWith("/outages")
        ? { success: true, result: { annotations: [outage()] } }
        : fixture(),
    ),
  );
  const response = await h.run();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.outages[0].scope, "ASN");
  assert.equal(data.outages[0].end, null);
});
test("rejects invalid ratios and mismatched timestamp arrays", async () => {
  for (const value of ["", "NaN", "1.1", "-0.1"]) {
    const h = harness(() => {
      const f = fixture();
      f.result.serie_0.values[0] = value;
      return Response.json(f);
    });
    assert.equal((await h.run()).status, 502);
  }
  const h = harness(() => {
    const f = fixture();
    f.result.serie_0.timestamps.pop();
    return Response.json(f);
  });
  assert.equal((await h.run()).status, 502);
});
test("caches by country with a finite lifetime", async () => {
  const h = harness();
  assert.equal((await h.run()).status, 200);
  await h.run();
  assert.equal(h.calls.length, 2);
  await h.run("country=US");
  assert.equal(h.calls.length, 4);
  h.advance(3600001);
  await h.run();
  assert.equal(h.calls.length, 6);
});
test("rate limiting backs off across countries without leaking upstream details", async () => {
  const h = harness(
    () =>
      new Response("private-upstream-body", {
        status: 429,
        headers: { "retry-after": "120" },
      }),
  );
  const first = await h.run();
  assert.equal(first.status, 429);
  assert.equal(first.headers.get("retry-after"), "120");
  assert.doesNotMatch(
    await first.text(),
    /private-upstream-body|test-only-placeholder/,
  );
  h.advance(10000);
  const next = await h.run("country=US");
  assert.equal(next.status, 429);
  assert.equal(next.headers.get("retry-after"), "110");
  assert.equal(h.calls.length, 1);
  h.advance(120000);
  await h.run();
  assert.equal(h.calls.length, 2);
});
test("upstream errors, oversized bodies and thrown exceptions fail closed", async () => {
  for (const reply of [
    () => new Response("private-upstream-body", { status: 403 }),
    () => new Response("x".repeat(262145)),
    () => {
      throw new Error("test-only-placeholder");
    },
  ]) {
    const h = harness(reply);
    const response = await h.run();
    assert.equal(response.status, 502);
    assert.doesNotMatch(
      await response.text(),
      /private-upstream-body|test-only-placeholder/,
    );
  }
});
