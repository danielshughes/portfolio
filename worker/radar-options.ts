import type { RadarOptions } from "./radar.ts";
import { readSnapshot } from "./snapshots.ts";
import { developmentCache } from "./radar-cache.ts";

export function radarOptions(env: Env, nativeCache = false): RadarOptions {
  const cache =
    env.SITE_ENV === "production"
      ? {
          match: (key: string) => caches.default.match(key),
          put: (key: string, response: Response) =>
            caches.default.put(key, response),
        }
      : developmentCache(env.HISTORY);
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
      readSnapshot(env.RADAR_SNAPSHOTS, country, view, Date.now),
    // Workers Cache owns successful responses in the trial. Keep only the
    // shared provider backoff in D1, not a second success cache with a new TTL.
    cache: nativeCache
      ? {
          match: (key) =>
            key.endsWith("/backoff")
              ? cache.match(key)
              : Promise.resolve(undefined),
          put: (key, response) =>
            key.endsWith("/backoff")
              ? cache.put(key, response)
              : Promise.resolve(),
        }
      : cache,
  };
}
