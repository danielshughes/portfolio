import { countries } from "../src/experiments/internet-model.ts";
import { radarViewIds } from "../src/experiments/radar-views.ts";
import { MAX_BACKOFF_SECONDS, type RadarOptions } from "./radar.ts";

// Access-fronted Workers cannot use Cache API. Reuse the development D1
// binding with a finite keyspace rather than retaining request I/O in isolates.
const keys = new Set([
  "/api/.radar/v1/backoff",
  ...countries.flatMap(({ code }) =>
    radarViewIds.map((view) => `/api/.radar/v2/${code}/${view}`),
  ),
]);
function cacheKey(value: string) {
  const url = new URL(value);
  if (!keys.has(url.pathname) || url.search || url.hash)
    throw new Error("Invalid Radar cache key");
  return url.pathname;
}
export function developmentCache(db: D1Database): RadarOptions["cache"] {
  return {
    async match(value) {
      const row = await db
        .prepare(
          "SELECT body,headers FROM radar_cache WHERE key=? AND expires>?",
        )
        .bind(cacheKey(value), Date.now())
        .first<{ body: string; headers: string }>();
      if (!row) return undefined;
      return new Response(row.body, { headers: JSON.parse(row.headers) });
    },
    async put(value, response) {
      const key = cacheKey(value);
      const ttl = Number(
        response.headers
          .get("cache-control")
          ?.match(/(?:^|[,\s])max-age=(\d+)(?:$|[,\s])/)?.[1],
      );
      const body = await response.text();
      if (
        response.status !== 200 ||
        !Number.isInteger(ttl) ||
        ttl < 1 ||
        ttl > (key === "/api/.radar/v1/backoff" ? MAX_BACKOFF_SECONDS : 3600) ||
        new TextEncoder().encode(body).length > 262144
      )
        throw new Error("Invalid Radar cache entry");
      await db
        .prepare(
          "INSERT INTO radar_cache (key,body,headers,expires) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,headers=excluded.headers,expires=excluded.expires",
        )
        .bind(
          key,
          body,
          JSON.stringify([...response.headers]),
          Date.now() + ttl * 1000,
        )
        .run();
    },
  };
}
