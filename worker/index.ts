import { handleRadar } from "./radar.ts";
import { securityHeaders } from "../src/security/policy.ts";
import { edgeDetails } from "./edge.ts";
import { apiJson, isLocalPreview, sameOrigin } from "./http.ts";
import { healthHistory, collectHealth } from "./health.ts";
import { triage, triageConfiguration } from "./triage.ts";
import { radarOptions } from "./radar-options.ts";
import { collectSnapshots } from "./snapshots.ts";
import { streamDemo } from "./stream.ts";
export { CoordinationRoom } from "./coordination.ts";

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
        const response = await handleRadar(request, radarOptions(env));
        span.setAttribute("http.response.status_code", response.status);
        span.setAttribute(
          "radar.snapshot",
          response.headers.get("x-radar-storage") === "snapshot",
        );
        return protect(response);
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
        collectSnapshots(env, event.scheduledTime, radarOptions(env)),
      ]);
      const radar = results[1];
      if (radar.status === "fulfilled")
        span.setAttribute("radar.collection.status", radar.value.status);
      const incompleteRadar =
        radar.status === "fulfilled" &&
        (radar.value.status === "empty" || radar.value.status === "partial");
      if (incompleteRadar && radar.status === "fulfilled")
        console.warn(
          JSON.stringify({
            event: "scheduled_collection_incomplete",
            service: "radar",
            status: radar.value.status,
            country: radar.value.country,
            acceptedViews: radar.value.views.length,
            ...(radar.value.status === "empty"
              ? { reason: radar.value.reason }
              : {}),
            version: env.CF_VERSION_METADATA.id,
          }),
        );
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
} satisfies ExportedHandler<Env>;
