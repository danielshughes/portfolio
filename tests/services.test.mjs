import assert from "node:assert/strict";
import test from "node:test";
import { runtime } from "./runtime-harness.mjs";

const origin = "https://portfolio.example";
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
  const mf = await runtime();
  t.after(() => mf.dispose());
  const responses = await Promise.all(
    Array.from({ length: 55 }, () =>
      mf.dispatchFetch(origin + "/api/triage?scenario=latency", {
        method: "POST",
        headers: { origin },
      }),
    ),
  );
  assert.equal(
    responses.filter((r) => r.status === 429).length,
    5,
    JSON.stringify(responses.map((r) => r.status)),
  );
  assert.equal(responses.filter((r) => r.status === 503).length, 50);
  const db = await mf.getD1Database("HISTORY");
  assert.equal(
    (await db.prepare("SELECT used FROM ai_budget WHERE id=1").first()).used,
    50,
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
  await worker.scheduled({ scheduledTime: time, cron: "*/5 * * * *" });
  const db = await mf.getD1Database("HISTORY");
  const rows = (await db.prepare("SELECT * FROM health_samples").all()).results;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, 1);
  assert.equal(radarCalls, 1);
  await db
    .prepare("INSERT INTO health_samples VALUES (?,503,10,0)")
    .bind(time - 8 * 86400000)
    .run();
  await worker.scheduled({ scheduledTime: time, cron: "*/5 * * * *" });
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM health_samples").first())
      .count,
    1,
  );
});

test("a health storage failure does not prevent scheduled Radar collection", async (t) => {
  let calls = 0;
  const mf = await runtime({
    outbound() {
      calls++;
      return new Response(null, { status: 503 });
    },
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("HISTORY");
  // Only the disposable fixture database is altered.
  await db.exec("DROP TABLE health_samples");
  const worker = await mf.getWorker();
  await worker.scheduled({ scheduledTime: Date.now(), cron: "*/5 * * * *" });
  assert.equal(calls, 1);
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
