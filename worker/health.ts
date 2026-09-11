import { apiJson } from "./http.ts";
import {
  HEALTH_INTERVAL_MS,
  HEALTH_WINDOW_MS,
  HEALTH_EXPECTED_SAMPLES,
} from "../src/experiments/health-model.ts";

const healthTarget = (env: Env) =>
  env.SITE_ENV === "production"
    ? "https://danhughes.uk/"
    : "https://dev.danhughes.uk/";
const RETENTION = 7 * 86400000;

export async function collectHealth(env: Env, time: number) {
  const db = env.HISTORY;
  const started = Date.now();
  let status = 0;
  let ok = false;
  try {
    const response = await env.ASSETS.fetch(
      new Request(healthTarget(env), {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "user-agent": "PortfolioHealthSample/1.0" },
      }),
    );
    status = response.status;
    ok =
      response.status === 200 &&
      (response.headers.get("content-type") ?? "").includes("text/html");
    await response.body?.cancel();
  } catch {
    /* A failed measurement is stored, never replaced with success. */
  }
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO health_samples (observed_at,status,elapsed_ms,ok) VALUES (?,?,?,?)",
      )
      .bind(
        Math.floor(time / HEALTH_INTERVAL_MS) * HEALTH_INTERVAL_MS,
        status,
        Math.max(0, Date.now() - started),
        ok ? 1 : 0,
      ),
    db
      .prepare("DELETE FROM health_samples WHERE observed_at < ?")
      .bind(time - RETENTION),
  ]);
}

export async function healthHistory(env: Env, now: number) {
  const db = env.HISTORY;
  const start = now - HEALTH_WINDOW_MS;
  const rows = await db
    .prepare(
      "SELECT observed_at, status, elapsed_ms, ok FROM health_samples WHERE observed_at > ? AND observed_at <= ? ORDER BY observed_at LIMIT ?",
    )
    .bind(start, now, HEALTH_EXPECTED_SAMPLES)
    .all<{
      observed_at: number;
      status: number;
      elapsed_ms: number;
      ok: number;
    }>();
  return apiJson(
    {
      target: healthTarget(env),
      measurement: "asset-binding-response-headers",
      window: {
        start: new Date(start).toISOString(),
        end: new Date(now).toISOString(),
      },
      intervalMs: HEALTH_INTERVAL_MS,
      expectedSamples: HEALTH_EXPECTED_SAMPLES,
      coverage: rows.results.length / HEALTH_EXPECTED_SAMPLES,
      samples: rows.results,
    },
    200,
    "public, max-age=60",
  );
}
