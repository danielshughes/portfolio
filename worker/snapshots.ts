import { isRadarData } from "../src/experiments/radar-client.ts";
import { isRadarSummary } from "../src/experiments/radar-summary.ts";
import { countries } from "../src/experiments/internet-model.ts";
import { handleRadar, type RadarOptions } from "./radar.ts";

const VIEWS = ["traffic", "bots", "devices", "protocols"] as const;
const MAX_AGE = 3600000;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function snapshotPayload(
  value: unknown,
  country: string,
  view: string,
  now: number,
) {
  if (!record(value) || typeof value.fetchedAt !== "string") return;
  const age = now - Date.parse(value.fetchedAt);
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE) return;
  if (
    view === "traffic"
      ? !isRadarData(value, country)
      : !isRadarSummary(value, country, view)
  )
    return;
  return value;
}
export async function readSnapshot(
  kv: KVNamespace,
  country: string,
  view: string,
  now: number,
) {
  const raw = await kv.get(`country:${country}`, {
    type: "text",
    cacheTtl: 60,
  });
  if (!raw || raw.length > 100000) return;
  let bundle: unknown;
  try {
    bundle = JSON.parse(raw);
  } catch {
    return;
  }
  if (!record(bundle)) return;
  const value = snapshotPayload(bundle[view], country, view, now);
  if (!value) return;
  const seconds = Math.max(
    1,
    Math.floor((MAX_AGE - (now - Date.parse(String(value.fetchedAt)))) / 1000),
  );
  return Response.json(value, {
    headers: {
      "cache-control": `public, max-age=${seconds}`,
      "x-radar-storage": "snapshot",
    },
  });
}

export async function collectSnapshots(
  env: Env,
  time: number,
  options: RadarOptions,
) {
  const country = countries[Math.floor(time / 300000) % countries.length].code;
  const bundle: Record<string, unknown> = {};
  // Fixed small batch: five upstream requests and one KV write per tick.
  // Invocation-local cache prevents an old PoP cache from perpetually renewing
  // a snapshot. Error backoff still applies across the four requests.
  const cache = new Map<string, Response>();
  const scheduledOptions = {
    ...options,
    snapshot: undefined,
    cache: {
      match: async (key: string) => cache.get(key)?.clone(),
      put: async (key: string, response: Response) => {
        cache.set(key, response.clone());
      },
    },
  };
  for (const view of VIEWS) {
    const response = await handleRadar(
      new Request(
        `https://portfolio.invalid/api/radar?country=${country}&view=${view}`,
      ),
      scheduledOptions,
    );
    if (!response.ok) {
      await response.body?.cancel();
      continue;
    }
    const value: unknown = await response.json();
    if (snapshotPayload(value, country, view, Date.now())) bundle[view] = value;
  }
  if (Object.keys(bundle).length)
    await env.RADAR_SNAPSHOTS.put(
      `country:${country}`,
      JSON.stringify(bundle),
      { expirationTtl: 7200 },
    );
}
