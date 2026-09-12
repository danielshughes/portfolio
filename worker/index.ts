import { WorkerEntrypoint } from "cloudflare:workers";
import { handleRadar, readRadar } from "./radar.ts";
import { securityHeaders } from "../src/security/policy.ts";
import { edgeDetails } from "./edge.ts";
import { apiJson, isLocalPreview, sameOrigin } from "./http.ts";
import { healthHistory, collectHealth } from "./health.ts";
import { triage, triageConfiguration } from "./triage.ts";
import { radarOptions } from "./radar-options.ts";
import { collectSnapshots, type SnapshotCollection } from "./snapshots.ts";
import { streamDemo } from "./stream.ts";
export { CoordinationRoom } from "./coordination.ts";

export class RadarData extends WorkerEntrypoint<Env> {
  fetch(request: Request): Promise<Response> {
    return readRadar(request, radarOptions(this.env, true));
  }
}

function incompleteCollection(result: SnapshotCollection, env: Env) {
  if (result.status !== "empty" && result.status !== "partial") return false;
  console.warn(
    JSON.stringify({
      event: "radar_collection_incomplete",
      status: result.status,
      country: result.country,
      acceptedViews: result.views.length,
      ...(result.status === "empty" ? { reason: result.reason } : {}),
      version: env.CF_VERSION_METADATA.id,
    }),
  );
  return true;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const path = new URL(request.url).pathname;
    const protect = (response: Response) => {
      const secured = new Response(response.body, {
        status: response.status,
        headers: response.headers,
        ...(response.webSocket ? { webSocket: response.webSocket } : {}),
      });
      for (const [key, value] of Object.entries(
        securityHeaders(env.SITE_ENV !== "production"),
      ))
        secured.headers.set(key, value);
      return secured;
    };
    if (path === "/api/radar") {
      return ctx.tracing.enterSpan("radar", async (span) => {
        span.setAttribute("deployment.version", env.CF_VERSION_METADATA.id);
        const response = await handleRadar(
          request,
          radarOptions(env),
          String(env.RADAR_NATIVE_CACHE) === "true" &&
            !isLocalPreview(request, env)
            ? (canonical) => ctx.exports.RadarData.fetch(canonical)
            : undefined,
        );
        span.setAttribute("http.response.status_code", response.status);
        span.setAttribute(
          "radar.snapshot",
          response.headers.get("x-radar-storage") === "snapshot",
        );
        const secured = protect(response);
        const cacheStatus = response.headers.get("cf-cache-status");
        if (
          cacheStatus &&
          [
            "HIT",
            "MISS",
            "BYPASS",
            "EXPIRED",
            "REVALIDATED",
            "UPDATING",
            "STALE",
            "DYNAMIC",
          ].includes(cacheStatus)
        ) {
          span.setAttribute("radar.cache.status", cacheStatus);
          secured.headers.set("x-radar-cache", cacheStatus);
        }
        return secured;
      });
    }
    if (
      [
        "/api/edge",
        "/api/health",
        "/api/triage",
        "/api/triage-config",
        "/api/coordination",
        "/api/stream",
      ].includes(path)
    ) {
      try {
        if (
          !(await env.RADAR_INGRESS.limit({ key: "experiments-ingress" }))
            .success
        )
          return protect(apiJson({ error: "rate_limited" }, 429));
        if (
          ["/api/triage", "/api/coordination", "/api/stream"].includes(path) &&
          !(await env.EXPERIMENT_STARTS.limit({ key: path })).success
        )
          return protect(apiJson({ error: "rate_limited" }, 429));
        if (path === "/api/triage") return protect(await triage(request, env));
        if (path === "/api/triage-config")
          return protect(triageConfiguration(request, env));
        if (path === "/api/stream") return protect(await streamDemo(request));
        if (request.method !== "GET")
          return protect(apiJson({ error: "method_not_allowed" }, 405));
        if (new URL(request.url).search)
          return protect(apiJson({ error: "invalid_query" }, 400));
        if (path === "/api/edge")
          return protect(
            apiJson(
              {
                mode: isLocalPreview(request, env) ? "local" : "observed",
                ...edgeDetails(
                  isLocalPreview(request, env) ? undefined : request.cf,
                ),
              },
              200,
              "private, no-store",
            ),
          );
        if (path === "/api/health")
          return protect(await healthHistory(env, Date.now()));
        if (!sameOrigin(request))
          return protect(apiJson({ error: "origin_not_allowed" }, 403));
        return protect(
          await env.COORDINATION.getByName("demonstration-room").fetch(request),
        );
      } catch {
        console.warn(
          JSON.stringify({
            event: "experiment_unavailable",
            path,
            version: env.CF_VERSION_METADATA.id,
          }),
        );
        return protect(apiJson({ error: "experiment_unavailable" }, 503));
      }
    }
    if (path.startsWith("/api/"))
      return protect(
        Response.json(
          { error: "not_found" },
          { status: 404, headers: { "cache-control": "no-store" } },
        ),
      );
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    await ctx.tracing.enterSpan("scheduled-collection", async (span) => {
      span.setAttribute("deployment.version", env.CF_VERSION_METADATA.id);
      const jobs = ["health", "radar"];
      const results = await Promise.allSettled([
        collectHealth(env, event.scheduledTime),
        collectSnapshots(
          env,
          event.scheduledTime,
          radarOptions(env),
          env.RADAR_COLLECTION_QUEUE ? "dispatch" : "direct",
        ),
      ]);
      const radar = results[1];
      if (radar.status === "fulfilled")
        span.setAttribute("radar.collection.status", radar.value.status);
      const incompleteRadar =
        radar.status === "fulfilled" && incompleteCollection(radar.value, env);
      results.forEach((result, index) => {
        if (result.status === "rejected")
          console.warn(
            JSON.stringify({
              event: "scheduled_collection_failed",
              service: jobs[index],
              version: env.CF_VERSION_METADATA.id,
            }),
          );
      });
      if (
        incompleteRadar ||
        results.some((result) => result.status === "rejected")
      )
        throw new Error("Scheduled collection incomplete");
    });
  },
  async queue(batch, env, ctx) {
    await ctx.tracing.enterSpan("queued-radar-collection", async (span) => {
      span.setAttribute("deployment.version", env.CF_VERSION_METADATA.id);
      // No public enqueue endpoint. Reject unexpected bindings, batches and
      // payloads before storage or provider work, including delayed stale jobs.
      const body: unknown = batch.messages[0]?.body;
      const time =
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        Object.keys(body).length === 1 &&
        Object.hasOwn(body, "scheduledTime") &&
        "scheduledTime" in body
          ? body.scheduledTime
          : undefined;
      const age = typeof time === "number" ? Date.now() - time : NaN;
      if (
        !env.RADAR_COLLECTION_QUEUE ||
        batch.messages.length !== 1 ||
        typeof time !== "number" ||
        !Number.isSafeInteger(time) ||
        time < 0 ||
        time % 300000 !== 0 ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= 600000
      ) {
        span.setAttribute("radar.collection.status", "discarded");
        batch.ackAll();
        return;
      }
      const result = await collectSnapshots(
        env,
        time,
        radarOptions(env),
        "consume",
      );
      span.setAttribute("radar.collection.status", result.status);
      // Native max_retries=0: keep the claim after a failure and wait for the
      // next scheduled slot rather than replaying a possibly completed write.
      if (incompleteCollection(result, env))
        throw new Error("Radar collection incomplete");
      batch.ackAll();
    });
  },
} satisfies ExportedHandler<Env>;
