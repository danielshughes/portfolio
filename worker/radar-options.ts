import type { RadarOptions } from "./radar.ts";
import { readSnapshot } from "./snapshots.ts";
import { developmentCache } from "./radar-cache.ts";

export function radarOptions(env: Env): RadarOptions {
  return {
    enabled: String(env.RADAR_ENABLED) === "true",
    ingress: env.RADAR_INGRESS,
    upstream: env.RADAR_UPSTREAM,
    token: env.RADAR_API_TOKEN,
    now: Date.now,
    fetch: (url, init) => fetch(url, init),
    reportFailure: (stage, kind) =>
      console.warn(
        JSON.stringify({
          event: "radar_failure",
          stage,
          kind,
          version: env.CF_VERSION_METADATA.id,
        }),
      ),
    snapshot: (country, view) =>
      readSnapshot(env.RADAR_SNAPSHOTS, country, view, Date.now()),
    cache:
      env.SITE_ENV === "production"
        ? {
            match: (key) => caches.default.match(key),
            put: (key, response) => caches.default.put(key, response),
          }
        : developmentCache(env.HISTORY),
  };
}
