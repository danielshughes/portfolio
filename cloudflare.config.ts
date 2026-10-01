import { bindings, defineConfig, exports, triggers } from "cf/config";
import * as worker from "./worker/index.ts" with { type: "cf-worker" };

const environments = {
  development: {
    name: "dan-hughes-portfolio-development",
    domain: "dev.danhughes.uk",
    database: "5b6ac184-5b43-4bbd-b632-72930dd30f81",
    namespace: "484fcacb5bf34479b57c00abf992ddfd",
    siteKey: "0x4AAAAAAEwKiOJAwAjFoULs",
    schedule: "*/5 * * * *",
    ratePrefix: "100",
  },
  production: {
    name: "dan-hughes-portfolio-production",
    domain: "danhughes.uk",
    database: "b3b22943-2329-4ddf-b02d-212db9ae5cd7",
    namespace: "3bbf7af7f0984ec698fd41bd74fc02a1",
    siteKey: "0x4AAAAAAEwLS8fdnPVShcn4",
    schedule: "2-59/5 * * * *",
    ratePrefix: "200",
  },
};

export function portfolioConfig(mode = "development") {
  if (mode !== "development" && mode !== "production")
    throw new Error("Cloudflare mode must be development or production");
  const settings = environments[mode];
  const queue = `portfolio-radar-${mode}`;
  return {
    worker: {
      name: settings.name,
      entrypoint: worker,
      compatibilityDate: "2026-09-10",
      compatibilityFlags: ["nodejs_compat"],
      workersDev: false,
      previewUrls: false,
      cache: { enabled: false },
      assets: {
        notFoundHandling: "404-page" as const,
        runWorkerFirst: ["/api/*"],
      },
      domains: [settings.domain],
      observability: {
        redactQueryString: true,
        logs: { enabled: true, headSamplingRate: 1, invocationLogs: true },
        traces: { enabled: true, headSamplingRate: 0.01 },
      },
      exports: {
        default: exports.worker({ cache: { enabled: false } }),
        RadarData: exports.worker({ cache: { enabled: true } }),
        // Preserve the existing class and SQLite namespace; do not replay v1.
        CoordinationRoom: exports.durableObject({ storage: "sqlite" }),
      },
      triggers: [
        triggers.scheduled({ schedule: settings.schedule }),
        triggers.queue({
          name: queue,
          maxBatchSize: 1,
          maxBatchTimeout: 0,
          maxConcurrency: 1,
          maxRetries: 0,
        }),
      ],
      env: {
        RADAR_ENABLED: bindings.json<boolean>(true),
        RADAR_NATIVE_CACHE: bindings.json<boolean>(true),
        SITE_ENV: bindings.text<string>(mode),
        LOCAL_PREVIEW: bindings.text<string>("false"),
        TURNSTILE_SITE_KEY: bindings.text<string>(settings.siteKey),
        RADAR_API_TOKEN: bindings.secret(),
        TURNSTILE_SECRET_KEY: bindings.secret(),
        ASSETS: bindings.assets(),
        HISTORY: bindings.d1({
          name: `portfolio-${mode}`,
          id: settings.database,
        }),
        RADAR_SNAPSHOTS: bindings.kv({ id: settings.namespace }),
        RADAR_COLLECTION_QUEUE: bindings.queue({ name: queue }),
        COORDINATION: bindings.durableObject({
          worker: settings.name,
          exportName: "CoordinationRoom",
        }),
        AI: bindings.ai({}),
        CF_VERSION_METADATA: bindings.versionMetadata(),
        EXPERIMENT_STARTS: bindings.rateLimit({
          namespace: `${settings.ratePrefix}3`,
          simple: { limit: 12, period: 60 },
        }),
        RADAR_INGRESS: bindings.rateLimit({
          namespace: `${settings.ratePrefix}1`,
          simple: { limit: 300, period: 60 },
        }),
        RADAR_UPSTREAM: bindings.rateLimit({
          namespace: `${settings.ratePrefix}2`,
          simple: { limit: 60, period: 60 },
        }),
      },
    },
  };
}

export default defineConfig(({ mode }) => portfolioConfig(mode));
