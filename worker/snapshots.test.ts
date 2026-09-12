import assert from "node:assert/strict";
import test from "node:test";
import {
  collectSnapshots,
  readSnapshot,
  snapshotPayload,
} from "./snapshots.ts";
import { countries } from "../src/experiments/internet-model.ts";
import {
  radarFixtureTime,
  radarUpstream,
} from "../tests/fixtures/radar-upstream.mjs";
import type { RadarOptions } from "./radar.ts";

function harness(failDimension?: string, descriptions: string[] = []) {
  const writes: { key: string; body: string; ttl: number | undefined }[] = [];
  let calls = 0,
    admissions = 0;
  let claimedSlot = -1;
  const env = {
    HISTORY: {
      prepare() {
        return {
          bind(slot: number) {
            return {
              async first() {
                if (slot <= claimedSlot) return null;
                claimedSlot = slot;
                return { slot };
              },
            };
          },
        };
      },
    },
    RADAR_SNAPSHOTS: {
      async get() {
        return writes.at(-1)?.body ?? null;
      },
      async put(key: string, body: string, options?: KVNamespacePutOptions) {
        writes.push({ key, body, ttl: options?.expirationTtl });
      },
    },
  } as Env;
  const options: RadarOptions = {
    enabled: true,
    token: "explicitly-fake-collector-fixture",
    now: () => radarFixtureTime,
    ingress: {
      async limit() {
        admissions++;
        return { success: true };
      },
    },
    upstream: {
      async limit() {
        return { success: true };
      },
    },
    fetch: async (url) => {
      calls++;
      return radarUpstream(url, failDimension, descriptions);
    },
    cache: {
      match: async () => undefined,
      put: async () => assert.fail("collector must use invocation-local cache"),
    },
  };
  const country =
    countries[Math.floor(radarFixtureTime / 300000) % countries.length].code;
  return {
    env,
    options,
    writes,
    country,
    calls: () => calls,
    admissions: () => admissions,
  };
}

test("complete collection uses the injected clock and persists each validated view once", async () => {
  const h = harness();
  const result = await collectSnapshots(h.env, radarFixtureTime, h.options);
  assert.deepEqual(result, {
    status: "complete",
    country: h.country,
    views: ["traffic", "bots", "devices", "protocols"],
  });
  assert.equal(h.calls(), 5);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].key, `country:${h.country}`);
  assert.equal(h.writes[0].ttl, 7200);
  const bundle = JSON.parse(h.writes[0].body);
  assert.deepEqual(Object.keys(bundle), result.views);
  for (const value of Object.values(bundle) as { fetchedAt: string }[])
    assert.equal(value.fetchedAt, new Date(radarFixtureTime).toISOString());
});

async function bundleAtBytes(bytes: number) {
  const h = harness(undefined, Array(100).fill("é"));
  await collectSnapshots(h.env, radarFixtureTime, h.options);
  const bundle = JSON.parse(h.writes[0].body);
  let remaining = bytes - Buffer.byteLength(JSON.stringify(bundle));
  for (const outage of bundle.traffic.outages) {
    const pairs = Math.min(Math.floor(remaining / 2), 1998);
    outage.description += "é".repeat(pairs);
    remaining -= pairs * 2;
    if (remaining === 1) {
      outage.description += "x";
      remaining--;
    }
  }
  assert.equal(remaining, 0);
  const raw = JSON.stringify(bundle);
  assert.equal(Buffer.byteLength(raw), bytes);
  return {
    raw,
    bundle,
    country: h.country,
    descriptions: bundle.traffic.outages.map(
      (outage: { description: string }) => outage.description,
    ),
  };
}

test("a complete ordinary bundle reads back every accepted view intact", async () => {
  const h = harness();
  const result = await collectSnapshots(h.env, radarFixtureTime, h.options);
  const bundle = JSON.parse(h.writes[0].body);
  for (const view of result.views) {
    const response = await readSnapshot(
      h.env.RADAR_SNAPSHOTS,
      h.country,
      view,
      radarFixtureTime,
    );
    assert.equal(response?.headers.get("x-radar-storage"), "snapshot");
    assert.deepEqual(await response?.json(), bundle[view]);
  }
});

test("oversized valid annotations skip the whole traffic view and retain later summaries", async () => {
  const normal = harness();
  await collectSnapshots(normal.env, radarFixtureTime, normal.options);
  const expected = JSON.parse(normal.writes[0].body);
  delete expected.traffic;
  const h = harness(undefined, Array(100).fill("x".repeat(1400)));
  const result = await collectSnapshots(h.env, radarFixtureTime, h.options);
  assert.deepEqual(result, {
    status: "partial",
    country: h.country,
    views: ["bots", "devices", "protocols"],
  });
  assert.equal(h.calls(), 5);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(JSON.parse(h.writes[0].body), expected);
  for (const view of result.views) {
    const response = await readSnapshot(
      h.env.RADAR_SNAPSHOTS,
      h.country,
      view,
      radarFixtureTime,
    );
    assert.deepEqual(await response?.json(), expected[view]);
  }
});

test("the writer counts UTF-8 bytes and JSON framing at the exact bundle limit", async () => {
  for (const bytes of [100000, 100001]) {
    const fixture = await bundleAtBytes(bytes);
    const h = harness(undefined, fixture.descriptions);
    const result = await collectSnapshots(h.env, radarFixtureTime, h.options);
    assert.equal(result.status, bytes === 100000 ? "complete" : "partial");
    assert.deepEqual(
      result.views,
      bytes === 100000
        ? ["traffic", "bots", "devices", "protocols"]
        : ["traffic", "bots", "devices"],
    );
    assert.equal(h.calls(), 5);
    assert.equal(h.writes.length, 1);
    assert.ok(Buffer.byteLength(h.writes[0].body) <= 100000);
    if (bytes === 100000) assert.equal(h.writes[0].body, fixture.raw);
    for (const view of result.views) {
      const response = await readSnapshot(
        h.env.RADAR_SNAPSHOTS,
        h.country,
        view,
        radarFixtureTime,
      );
      assert.deepEqual(await response?.json(), fixture.bundle[view]);
    }
  }
});

test("the reader rejects a multibyte bundle one UTF-8 byte above the shared bound", async () => {
  for (const bytes of [100000, 100001]) {
    const fixture = await bundleAtBytes(bytes);
    assert.ok(fixture.raw.length < 100000);
    const kv = { get: async () => fixture.raw } as unknown as KVNamespace;
    const response = await readSnapshot(
      kv,
      fixture.country,
      "traffic",
      radarFixtureTime,
    );
    if (bytes > 100000) assert.equal(response, undefined);
    else assert.deepEqual(await response?.json(), fixture.bundle.traffic);
  }
});

test("an oversized traffic view with unavailable later views returns empty without a KV write", async () => {
  const h = harness("BOT_CLASS", Array(100).fill("x".repeat(1400)));
  assert.deepEqual(await collectSnapshots(h.env, radarFixtureTime, h.options), {
    status: "empty",
    reason: "no_usable_views",
    country: h.country,
    views: [],
  });
  assert.equal(h.calls(), 3);
  assert.equal(h.writes.length, 0);
});

test("partial collection stores successful views and honours failure backoff", async () => {
  const h = harness("DEVICE_TYPE");
  const result = await collectSnapshots(h.env, radarFixtureTime, h.options);
  assert.deepEqual(result, {
    status: "partial",
    country: h.country,
    views: ["traffic", "bots"],
  });
  assert.equal(h.calls(), 4);
  assert.deepEqual(Object.keys(JSON.parse(h.writes[0].body)), [
    "traffic",
    "bots",
  ]);
});

test("enabled empty collection and missing credentials are never disabled success", async () => {
  for (const credential of ["explicitly-fake-collector-fixture", ""]) {
    const h = harness("timeseries");
    h.options.token = credential;
    assert.deepEqual(
      await collectSnapshots(h.env, radarFixtureTime, h.options),
      {
        status: "empty",
        reason: credential ? "no_usable_views" : "missing_credentials",
        country: h.country,
        views: [],
      },
    );
    assert.equal(h.calls(), credential ? 1 : 0);
    assert.equal(h.writes.length, 0);
  }
});

test("disabled collection skips admission, providers and storage", async () => {
  const h = harness();
  h.options.enabled = false;
  h.options.token = undefined;
  assert.deepEqual(await collectSnapshots(h.env, radarFixtureTime, h.options), {
    status: "disabled",
    country: h.country,
    views: [],
  });
  assert.equal(h.admissions(), 0);
  assert.equal(h.calls(), 0);
  assert.equal(h.writes.length, 0);
});

test("snapshot storage exceptions propagate", async () => {
  const h = harness();
  h.env.RADAR_SNAPSHOTS.put = async () => {
    throw new Error("fixture storage unavailable");
  };
  await assert.rejects(
    collectSnapshots(h.env, radarFixtureTime, h.options),
    /fixture storage unavailable/,
  );
});

test("unknown and inherited view names cannot be accepted as snapshots", () => {
  for (const view of ["constructor", "toString", "__proto__", "unknown"]) {
    const data = {
      mode: "radar",
      country: "GB",
      view,
      fetchedAt: new Date(radarFixtureTime).toISOString(),
      updatedAt: new Date(radarFixtureTime).toISOString(),
      window: { start: "2026-09-03T14:00:00Z", end: "2026-09-10T14:00:00Z" },
      confidence: { level: null, annotationCount: 0 },
      categories: [{ label: "observed", value: 100 }],
    };
    assert.equal(
      snapshotPayload(data, "GB", view, radarFixtureTime),
      undefined,
    );
  }
});
