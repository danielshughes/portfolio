import assert from "node:assert/strict";
import test from "node:test";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { runtime } from "./runtime-harness.mjs";
import { DAILY_AI_LIMIT } from "../worker/triage.ts";
import { radarUpstream } from "./fixtures/radar-upstream.mjs";
import { countries } from "../src/experiments/internet-model.ts";

test(
  "room close handlers never echo reserved WebSocket status codes",
  { timeout: 10000 },
  async (t) => {
    const mf = await runtime({
      entryPoint: "tests/fixtures/coordination-close.mjs",
    });
    t.after(() => mf.dispose());
    for (const [received, expected] of [
      [1000, 1000],
      [1001, 1001],
      [1005, 1000],
      [1006, 1000],
      [1015, 1000],
      [4001, 4001],
    ]) {
      const response = await mf.dispatchFetch(
        `https://example.test/api/close?code=${received}`,
      );
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify({ received, body }));
      assert.equal(body.code, expected);
    }
  },
);

const origin = "https://portfolio.example";

test("Cloudflare protection failures do not fall through to service work", async (t) => {
  let upstream = 0;
  const mf = await runtime({
    entryPoint: "tests/fixtures/protection-failure.mjs",
    outbound() {
      upstream++;
      return new Response(null, { status: 500 });
    },
  });
  t.after(() => mf.dispose());
  for (const binding of ["RADAR_INGRESS", "EXPERIMENT_STARTS"]) {
    for (const path of [
      "/api/triage?scenario=latency",
      "/api/stream",
      "/api/coordination",
    ]) {
      const response = await mf.dispatchFetch(origin + path, {
        method: path.includes("coordination") ? "GET" : "POST",
        headers: { origin, "fixture-failure": binding },
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: "experiment_unavailable",
      });
    }
  }
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    await db.prepare("SELECT used FROM ai_budget WHERE id=1").first(),
    null,
  );
  assert.equal(upstream, 0);
});

test("room reconnects cannot bypass the persisted daily join allowance", async (t) => {
  const mf = await runtime({
    entryPoint: "tests/fixtures/coordination-budget.mjs",
  });
  t.after(() => mf.dispose());
  const day = new Date().toISOString().slice(0, 10);
  await mf.dispatchFetch(origin + "/seed", {
    headers: { "fixture-day": day, "fixture-used": "199" },
  });
  const requests = await Promise.all(
    Array.from({ length: 3 }, () =>
      mf.dispatchFetch(origin + "/join", { headers: { upgrade: "websocket" } }),
    ),
  );
  for (const response of requests)
    if (response.webSocket) {
      response.webSocket.accept();
      response.webSocket.close(1000);
    }
  assert.deepEqual(requests.map((r) => r.status).sort(), [101, 429, 429]);
  assert.equal(
    (await (await mf.dispatchFetch(origin + "/budget")).json())[0].used,
    200,
  );
  await mf.dispatchFetch(origin + "/seed", {
    headers: { "fixture-day": "2000-01-01", "fixture-used": "200" },
  });
  const nextDay = await mf.dispatchFetch(origin + "/join", {
    headers: { upgrade: "websocket" },
  });
  assert.equal(nextDay.status, 101);
  nextDay.webSocket.accept();
  nextDay.webSocket.close(1000);
  assert.deepEqual(await (await mf.dispatchFetch(origin + "/budget")).json(), [
    { day, used: 1 },
  ]);
});

test("streaming sends a bounded fixed sequence and rejects visitor payloads", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  for (const [path, init, status] of [
    ["/api/stream", {}, 405],
    ["/api/stream?text=attacker", { method: "POST", headers: { origin } }, 400],
    [
      "/api/stream",
      { method: "POST", headers: { origin }, body: "attacker" },
      400,
    ],
    [
      "/api/stream",
      { method: "POST", headers: { origin: "https://evil.example" } },
      403,
    ],
  ])
    assert.equal((await mf.dispatchFetch(origin + path, init)).status, status);
  const response = await mf.dispatchFetch(origin + "/api/stream", {
    method: "POST",
    headers: { origin },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const text = await response.text();
  assert.ok(text.length < 2048);
  const frames = text.trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    frames.map((frame) => frame.sequence),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(frames.at(-1).done, true);
  assert.ok(frames.every((frame) => typeof frame.text === "string"));
});

test(
  "an abruptly terminated transport reaches the Durable Object close callback without throwing",
  { timeout: 15000 },
  async (t) => {
    const mf = await runtime({
      entryPoint: "tests/fixtures/coordination-close.mjs",
    });
    t.after(() => mf.dispose());
    const url = await mf.ready;
    const transport = createConnection({
      host: "127.0.0.1",
      port: Number(url.port),
    });
    t.after(() => transport.destroy());
    await once(transport, "connect");
    // A real upgrade, followed by TCP termination without a WebSocket close frame.
    const upgraded = new Promise((resolve, reject) => {
      let received = Buffer.alloc(0);
      const read = (chunk) => {
        received = Buffer.concat([received, chunk]);
        const headerEnd = received.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        if (
          !received.subarray(0, headerEnd).toString().startsWith("HTTP/1.1 101")
        )
          return reject(new Error("Expected a real WebSocket upgrade"));
        const frame = received.subarray(headerEnd + 4);
        if (frame.length < 2) return;
        const size = frame[1] & 127;
        if (size >= 126)
          return reject(new Error("Snapshot exceeded the short-frame bound"));
        if (frame.length < size + 2) return;
        transport.off("data", read);
        resolve(JSON.parse(frame.subarray(2, 2 + size).toString()));
      };
      transport.on("data", read);
      transport.once("error", reject);
    });
    transport.write(
      `GET /api/coordination HTTP/1.1\r\nHost: ${url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n\r\n`,
    );
    const snapshot = await upgraded;
    assert.equal(snapshot.kind, "snapshot");
    const ended = once(transport, "close");
    transport.destroy();
    await ended;

    let events = [];
    const deadline = Date.now() + 5000;
    while (!events.length && Date.now() < deadline) {
      const response = await mf.dispatchFetch(origin + "/api/close-events");
      assert.equal(response.status, 200);
      events = await response.json();
      if (!events.length) await delay(10);
    }
    assert.deepEqual(events, [{ code: 1006, error: null }]);

    const reconnect = new WebSocket(
      new URL("/api/coordination", url).toString().replace("http:", "ws:"),
    );
    t.after(() => reconnect.close(1000));
    const [current] = await once(reconnect, "message");
    assert.equal(JSON.parse(current.data).sequence, snapshot.sequence);
    const next = once(reconnect, "message");
    reconnect.send("pulse");
    const [pulse] = await next;
    assert.equal(
      JSON.parse(pulse.data).sequence,
      (snapshot.sequence + 1) % 1000000,
    );
    const closed = once(reconnect, "close");
    reconnect.close(1000);
    await closed;
  },
);

test("explicit local mode survives Wrangler rewriting the request origin", async (t) => {
  const mf = await runtime({ bindings: { LOCAL_PREVIEW: "true" } });
  t.after(() => mf.dispose());
  const edge = await mf.dispatchFetch(origin + "/api/edge", {
    cf: { country: "GB", colo: "LHR" },
  });
  assert.equal((await edge.json()).mode, "local");
  const inference = await mf.dispatchFetch(
    origin + "/api/triage?scenario=latency",
    {
      method: "POST",
      headers: { origin },
    },
  );
  assert.equal(inference.status, 503);
  assert.equal((await inference.json()).error, "local_inference_unavailable");
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM ai_budget").first()).count,
    0,
  );
});

test("local edge metadata is not presented as an observed Cloudflare connection", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  const response = await mf.dispatchFetch("http://127.0.0.1:8787/api/edge", {
    cf: { country: "GB", colo: "LHR", httpProtocol: "HTTP/3" },
  });
  const data = await response.json();
  assert.equal(data.mode, "local");
  assert.equal(data.country, null);
  assert.equal(data.colo, null);
  assert.equal(data.protocol, null);
});

test("local AI explains its remote dependency without reserving inference budget", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  const local = "http://127.0.0.1:8787";
  const response = await mf.dispatchFetch(
    local + "/api/triage?scenario=latency",
    {
      method: "POST",
      headers: { origin: local },
    },
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "local_inference_unavailable",
  });
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM ai_budget").first()).count,
    0,
  );
});

test("edge response is private, does not retain caller identity and enforces methods", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  const r = await mf.dispatchFetch(origin + "/api/edge", {
    cf: {
      country: "GB",
      colo: "LHR",
      httpProtocol: "HTTP/3",
      clientQuicRtt: 12,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const data = await r.json();
  assert.equal(data.country, "GB");
  assert.equal(data.colo, "LHR");
  assert.equal(
    (await mf.dispatchFetch(origin + "/api/edge?ip=anything")).status,
    400,
  );
  assert.equal(
    (await mf.dispatchFetch(origin + "/api/edge", { method: "POST" })).status,
    405,
  );
});
test("health history is empty until real scheduled measurements exist", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  const r = await mf.dispatchFetch(origin + "/api/health");
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.deepEqual(data.samples, []);
  assert.equal(data.coverage, 0);
  assert.equal(data.target, "https://dev.danhughes.uk/");
  assert.equal(data.measurement, "asset-binding-response-headers");
  assert.equal(
    Date.parse(data.window.end) - Date.parse(data.window.start),
    86400000,
  );
});
test("AI rejects arbitrary scenarios and cross-origin requests before inference", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound() {
      calls++;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => mf.dispose());
  for (const [path, init, status] of [
    ["/api/triage?scenario=latency", {}, 405],
    [
      "/api/triage?scenario=anything",
      { method: "POST", headers: { origin } },
      400,
    ],
    [
      "/api/triage?scenario=latency",
      { method: "POST", headers: { origin: "https://evil.example" } },
      403,
    ],
    [
      "/api/triage?scenario=latency&prompt=anything",
      { method: "POST", headers: { origin } },
      400,
    ],
  ])
    assert.equal((await mf.dispatchFetch(origin + path, init)).status, status);
  assert.equal(calls, 0);
});
test("daily inference reservations are atomic, bounded and count failures", async (t) => {
  let verified = 0;
  const mf = await runtime({
    bindings: {
      TURNSTILE_SITE_KEY: "public-fixture",
      TURNSTILE_SECRET_KEY: "fake-verification-secret",
    },
    limits: { EXPERIMENT_STARTS: 100 },
    outbound(request) {
      verified++;
      assert.equal(new URL(request.url).hostname, "challenges.cloudflare.com");
      return Response.json({
        success: true,
        hostname: "portfolio.example",
        action: "triage-latency",
      });
    },
  });
  t.after(() => mf.dispose());
  const responses = await Promise.all(
    Array.from({ length: DAILY_AI_LIMIT + 5 }, (_, index) =>
      mf.dispatchFetch(origin + "/api/triage?scenario=latency", {
        method: "POST",
        headers: {
          origin,
          "cf-turnstile-response": `fake-verified-token-${index}`,
        },
      }),
    ),
  );
  assert.equal(
    verified,
    DAILY_AI_LIMIT + 5,
    "every attempt reaches the verification fixture",
  );
  assert.equal(
    responses.filter((r) => r.status === 429).length,
    5,
    JSON.stringify(
      await Promise.all(
        responses.map(async (r) => ({
          status: r.status,
          body: await r.clone().json(),
        })),
      ),
    ),
  );
  assert.equal(
    responses.filter((r) => r.status === 503).length,
    DAILY_AI_LIMIT,
  );
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    (await db.prepare("SELECT used FROM ai_budget WHERE id=1").first()).used,
    DAILY_AI_LIMIT,
  );
});

test("a single-use verification response cannot reserve two AI attempts", async (t) => {
  const consumed = new Set();
  const mf = await runtime({
    bindings: {
      TURNSTILE_SITE_KEY: "public-fixture",
      TURNSTILE_SECRET_KEY: "fake-verification-secret",
    },
    async outbound(request) {
      assert.equal(new URL(request.url).hostname, "challenges.cloudflare.com");
      const { response } = await request.json();
      const success = !consumed.has(response);
      consumed.add(response);
      return Response.json({
        success,
        hostname: "portfolio.example",
        action: "triage-latency",
      });
    },
  });
  t.after(() => mf.dispose());
  const invoke = () =>
    mf.dispatchFetch(origin + "/api/triage?scenario=latency", {
      method: "POST",
      headers: { origin, "cf-turnstile-response": "one-use-fixture" },
    });
  const responses = await Promise.all([invoke(), invoke()]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [403, 503]);
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    (await db.prepare("SELECT used FROM ai_budget WHERE id=1").first()).used,
    1,
  );
});

test("bounded-start protection is separate from general read ingress", async (t) => {
  const mf = await runtime({ limits: { EXPERIMENT_STARTS: 1 } });
  t.after(() => mf.dispose());
  const invoke = () =>
    mf.dispatchFetch(origin + "/api/triage?scenario=latency", {
      method: "POST",
      headers: { origin },
    });
  assert.equal((await invoke()).status, 403);
  assert.equal((await invoke()).status, 429);
  assert.equal((await mf.dispatchFetch(origin + "/api/edge")).status, 200);
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    await db.prepare("SELECT used FROM ai_budget WHERE id=1").first(),
    null,
  );
});

test("scheduled collection measures this environment's assets without depending on production", async (t) => {
  let radarCalls = 0;
  const mf = await runtime({
    outbound(request) {
      assert.equal(new URL(request.url).origin, "https://api.cloudflare.com");
      radarCalls++;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => mf.dispose());
  const worker = await mf.getWorker();
  const time = Math.floor(Date.now() / 300000) * 300000;
  const collection = await worker.scheduled({
    scheduledTime: time,
    cron: "*/5 * * * *",
  });
  const db = await mf.getD1Database("HISTORY");
  const rows = (await db.prepare("SELECT * FROM health_samples").all()).results;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, 1);
  assert.equal(radarCalls, 1);
  assert.equal(collection.outcome, "exception");
  assert.equal(
    (await (await mf.getKVNamespace("RADAR_SNAPSHOTS")).list()).keys.length,
    0,
  );
  await db
    .prepare("INSERT INTO health_samples VALUES (?,503,10,0)")
    .bind(time - 8 * 86400000)
    .run();
  // The disposable KV fixture must retain an older bundle and its expiry when
  // this attempt has nothing usable. It must not renew absent observations.
  const kv = await mf.getKVNamespace("RADAR_SNAPSHOTS");
  const country = countries[Math.floor(time / 300000) % countries.length].code;
  const key = `country:${country}`;
  const prior = JSON.stringify({
    traffic: { fetchedAt: "2026-09-09T00:00:00Z" },
  });
  await kv.put(key, prior, { expirationTtl: 1200 });
  const previousKeys = (await kv.list()).keys;
  await worker.scheduled({ scheduledTime: time, cron: "*/5 * * * *" });
  assert.equal(await kv.get(key), prior);
  assert.deepEqual((await kv.list()).keys, previousKeys);
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM health_samples").first())
      .count,
    1,
  );
});

test("a health storage failure does not prevent scheduled Radar collection", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound(request) {
      calls++;
      return radarUpstream(request.url);
    },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("HISTORY");
  // Only the disposable fixture database is altered.
  await db.exec("DROP TABLE health_samples");
  const worker = await mf.getWorker();
  const time = Date.now();
  const collection = await worker.scheduled({
    scheduledTime: time,
    cron: "*/5 * * * *",
  });
  assert.equal(collection.outcome, "exception");
  assert.equal(calls, 5);
  const country = countries[Math.floor(time / 300000) % countries.length].code;
  const bundle = await (
    await mf.getKVNamespace("RADAR_SNAPSHOTS")
  ).get(`country:${country}`, "json");
  assert.deepEqual(Object.keys(bundle), [
    "traffic",
    "bots",
    "devices",
    "protocols",
  ]);
});

test("scheduled results distinguish complete, partial, disabled and missing credentials", async (t) => {
  for (const [mode, expected, views, calls] of [
    ["complete", "ok", ["traffic", "bots", "devices", "protocols"], 5],
    ["partial", "exception", ["traffic", "bots"], 4],
    ["disabled", "ok", [], 0],
    ["missing", "exception", [], 0],
  ])
    await t.test(mode, async (t) => {
      let attempts = 0;
      const mf = await runtime({
        bindings: {
          RADAR_ENABLED: mode !== "disabled",
          ...(mode === "missing" ? { RADAR_API_TOKEN: "" } : {}),
        },
        outbound(request) {
          attempts++;
          return radarUpstream(
            request.url,
            mode === "partial" ? "DEVICE_TYPE" : undefined,
          );
        },
      });
      t.after(() => mf.dispose());
      const time = Math.floor(Date.now() / 300000) * 300000;
      const collection = await (
        await mf.getWorker()
      ).scheduled({ scheduledTime: time, cron: "*/5 * * * *" });
      assert.equal(collection.outcome, expected);
      assert.equal(attempts, calls);
      const db = await mf.getD1Database("HISTORY");
      assert.equal(
        (
          await db
            .prepare("SELECT COUNT(*) AS count FROM health_samples WHERE ok=1")
            .first()
        ).count,
        1,
      );
      const kv = await mf.getKVNamespace("RADAR_SNAPSHOTS");
      const country =
        countries[Math.floor(time / 300000) % countries.length].code;
      const bundle = await kv.get(`country:${country}`, "json");
      assert.deepEqual(Object.keys(bundle ?? {}), views);
    });
});

test("valid recent KV snapshots serve without upstream access and expire honestly", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound() {
      calls++;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => mf.dispose());
  const kv = await mf.getKVNamespace("RADAR_SNAPSHOTS");
  const payload = {
    mode: "radar",
    country: "GB",
    view: "bots",
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    window: { start: "2026-09-03T00:00:00Z", end: "2026-09-10T00:00:00Z" },
    categories: [{ label: "human", value: 100 }],
    confidence: { level: null, annotationCount: 0 },
  };
  await kv.put("country:GB", JSON.stringify({ bots: payload }));
  const r = await mf.dispatchFetch(origin + "/api/radar?country=GB&view=bots");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-radar-storage"), "snapshot");
  assert.equal(calls, 0);
  await kv.put(
    "country:JP",
    JSON.stringify({
      bots: {
        ...payload,
        country: "JP",
        fetchedAt: new Date(Date.now() - 3600001).toISOString(),
      },
    }),
  );
  assert.equal(
    (await mf.dispatchFetch(origin + "/api/radar?country=JP&view=bots")).status,
    502,
  );
  assert.equal(calls, 1);
});
test("shared coordination broadcasts real state to both clients, rejecting invalid input", async (t) => {
  const mf = await runtime();
  t.after(() => mf.dispose());
  const connect = () =>
    mf.dispatchFetch(origin + "/api/coordination", {
      headers: { Upgrade: "websocket", origin },
    });
  assert.equal(
    (
      await mf.dispatchFetch(origin + "/api/coordination", {
        headers: { Upgrade: "websocket", origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const a = await connect(),
    b = await connect();
  assert.equal(a.status, 101);
  assert.equal(b.status, 101);
  a.webSocket.accept();
  b.webSocket.accept();
  const next = (socket) =>
    new Promise((resolve) =>
      socket.addEventListener("message", (e) => {
        const v = JSON.parse(e.data);
        if (v.kind === "pulse" && v.sequence === 1) resolve(v);
      }),
    );
  const first = next(a.webSocket),
    second = next(b.webSocket);
  a.webSocket.send("pulse");
  assert.deepEqual(await first, await second);
  const close = new Promise((resolve) =>
    a.webSocket.addEventListener("close", resolve, { once: true }),
  );
  a.webSocket.send("not-a-valid-message");
  assert.equal((await close).code, 1008);
  b.webSocket.close(1000);
});

test(
  "a room connection receives current state before the first pulse",
  { timeout: 3000 },
  async (t) => {
    const mf = await runtime();
    t.after(() => mf.dispose());
    const response = await mf.dispatchFetch(origin + "/api/coordination", {
      headers: { Upgrade: "websocket", origin },
    });
    const state = new Promise((resolve) =>
      response.webSocket.addEventListener(
        "message",
        (event) => resolve(JSON.parse(event.data)),
        { once: true },
      ),
    );
    response.webSocket.accept();
    const message = await state;
    assert.equal(message.kind, "snapshot");
    assert.equal(message.sequence, 0);
    response.webSocket.close(1000);
  },
);
