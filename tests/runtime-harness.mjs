import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";

// Only parse the checked-in non-secret configuration, never .env or .dev.vars.
export async function runtime(options = {}) {
  const config = JSON.parse(
    (await readFile("wrangler.jsonc", "utf8")).replace(/,\s*([}\]])/g, "$1"),
  );
  const environment = config.env.development;
  const bundle = await build({
    entryPoints: [options.entryPoint ?? config.main],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    external: ["cloudflare:workers"],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "portfolio-test",
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          assets: {
            ...config.assets,
            directory: "dist",
            routerConfig: { has_user_worker: true },
            assetConfig: {
              not_found_handling: config.assets.not_found_handling,
            },
          },
          bindings: {
            ...environment.vars,
            RADAR_ENABLED: true,
            // Native tiered cache is a deployed-only feature. Default fixtures
            // retain the local D1 cache; focused tests opt into the loopback.
            RADAR_NATIVE_CACHE: false,
            RADAR_API_TOKEN: "explicitly-fake-runtime-fixture",
            CF_VERSION_METADATA: {
              id: "test-version",
              tag: "test",
              timestamp: "2026-09-10T00:00:00Z",
            },
            ...options.bindings,
          },
          kvNamespaces: ["RADAR_SNAPSHOTS"],
          d1Databases: ["HISTORY"],
          ...(options.queue
            ? { queueProducers: { RADAR_COLLECTION_QUEUE: "radar-test" } }
            : {}),
          ...(options.queue === "consume"
            ? {
                queueConsumers: {
                  "radar-test": {
                    maxBatchSize: 1,
                    maxBatchTimeout: 0,
                    maxRetries: 0,
                  },
                },
              }
            : {}),
          durableObjects: {
            COORDINATION: { className: "CoordinationRoom", useSQLite: true },
          },
          ratelimits: Object.fromEntries(
            environment.ratelimits.map(({ name, ...value }) => [
              name,
              {
                ...value,
                ...(options.limits?.[name]
                  ? { simple: { limit: options.limits[name], period: 60 } }
                  : {}),
              },
            ]),
          ),
          outboundService:
            options.outbound ?? (() => new Response(null, { status: 503 })),
        },
      ],
      port: options.port ?? 0,
    }),
  );
  await mf.ready;
  const db = await mf.getD1Database("HISTORY");
  for (const file of (await readdir("worker/migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const migration = await readFile(`worker/migrations/${file}`, "utf8");
    await db.exec(migration.replace(/\n/g, " "));
  }
  return mf;
}
