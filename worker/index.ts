import { handleRadar } from "./radar.ts";
import { securityHeaders } from "../src/security/policy.ts";

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const protect = (response: Response) => {
      const secured = new Response(response.body, response);
      for (const [key, value] of Object.entries(
        securityHeaders(env.SITE_ENV !== "production"),
      ))
        secured.headers.set(key, value);
      return secured;
    };
    if (path === "/api/radar") {
      return protect(
        await handleRadar(request, {
          enabled: String(env.RADAR_ENABLED) === "true",
          ingress: env.RADAR_INGRESS,
          upstream: env.RADAR_UPSTREAM,
          token: env.RADAR_API_TOKEN,
          now: Date.now,
          fetch: (url, init) => fetch(url, init),
          reportFailure: (stage, kind) =>
            console.warn(
              JSON.stringify({ event: "radar_failure", stage, kind }),
            ),
          cache: {
            match: (key) => caches.default.match(key),
            put: (key, response) => caches.default.put(key, response),
          },
        }),
      );
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
} satisfies ExportedHandler<Env>;
