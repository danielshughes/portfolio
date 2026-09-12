import { isRadarData } from "../src/experiments/radar-client.ts";
import { isRadarSummary } from "../src/experiments/radar-summary.ts";
import { countries } from "../src/experiments/internet-model.ts";
import { handleRadar, type RadarOptions } from "./radar.ts";
import {
  isRadarView,
  radarViewIds,
  type RadarView,
} from "../src/experiments/radar-views.ts";

export type SnapshotCollection = {
  country: string;
  views: RadarView[];
} & (
  | { status: "disabled" | "skipped" | "queued" | "complete" | "partial" }
  | { status: "empty"; reason: "missing_credentials" | "no_usable_views" }
);
const MAX_AGE = 3600000;
const MAX_BUNDLE_BYTES = 100000;
const utf8 = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function snapshotPayload(
  value: unknown,
  country: string,
  view: string,
  now: number,
) {
  if (
    !isRadarView(view) ||
    !record(value) ||
    typeof value.fetchedAt !== "string"
  )
    return;
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
  clock: () => number,
) {
  if (!isRadarView(view) || !countries.some(({ code }) => code === country))
    return;
  const raw = await kv.get(`country:${country}`, {
    type: "text",
    cacheTtl: 60,
  });
  if (
    !raw ||
    raw.length > MAX_BUNDLE_BYTES ||
    utf8.encode(raw).byteLength > MAX_BUNDLE_BYTES
  )
    return;
  let bundle: unknown;
  try {
    bundle = JSON.parse(raw);
  } catch {
    return;
  }
  if (!record(bundle) || !Object.hasOwn(bundle, view)) return;
  const value = snapshotPayload(bundle[view], country, view, clock());
  if (!value) return;
  const seconds = Math.floor(
    (MAX_AGE - (clock() - Date.parse(String(value.fetchedAt)))) / 1000,
  );
  if (seconds < 1) return;
  return Response.json(value, {
    headers: {
      "cache-control": `public, max-age=${seconds}, must-revalidate`,
      "x-radar-storage": "snapshot",
    },
  });
}

export async function collectSnapshots(
  env: Env,
  time: number,
  options: RadarOptions,
  delivery: "direct" | "dispatch" | "consume" = "direct",
): Promise<SnapshotCollection> {
  const slot = Math.floor(time / 300000);
  const country = countries[slot % countries.length].code;
  if (!options.enabled) return { status: "disabled", country, views: [] };
  if (!options.token)
    return {
      status: "empty",
      reason: "missing_credentials",
      country,
      views: [],
    };
  // Claim before upstream work: different locations can deliver the same slot.
  // A failed attempt keeps its claim; the next slot can try independently.
  // Dispatch and consumption need separate claims: claiming a send must not
  // make its consumer look like a duplicate. Both tables are single-row bounds.
  const table = delivery === "dispatch" ? "radar_dispatch" : "radar_collection";
  // Checking the current dispatch belongs in the same atomic write, not an
  // earlier read that a newer Cron tick could invalidate before this claim.
  const admission =
    delivery === "consume"
      ? "SELECT 1,slot FROM radar_dispatch WHERE id=1 AND slot=?"
      : "VALUES (1,?)";
  const claimed = await env.HISTORY.prepare(
    `INSERT INTO ${table} (id,slot) ${admission} ON CONFLICT(id) DO UPDATE SET slot=excluded.slot WHERE ${table}.slot < excluded.slot RETURNING slot`,
  )
    .bind(slot)
    .first<{ slot: number }>();
  if (!claimed) return { status: "skipped", country, views: [] };
  if (delivery === "dispatch") {
    if (!env.RADAR_COLLECTION_QUEUE) throw new Error("Radar queue unavailable");
    await env.RADAR_COLLECTION_QUEUE.send(
      { scheduledTime: slot * 300000 },
      { contentType: "json" },
    );
    return { status: "queued", country, views: [] };
  }
  const entries: string[] = [];
  let bundleBytes = 2; // The enclosing JSON braces.
  const views: RadarView[] = [];
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
  for (const view of radarViewIds) {
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
    if (snapshotPayload(value, country, view, options.now())) {
      // Serialise each intact view once. Account for its key, colon and comma
      // without repeatedly serialising views already accepted into the bundle.
      const entry = `${JSON.stringify(view)}:${JSON.stringify(value)}`;
      const bytes = utf8.encode(entry).byteLength + (entries.length ? 1 : 0);
      if (bundleBytes + bytes > MAX_BUNDLE_BYTES) continue;
      entries.push(entry);
      bundleBytes += bytes;
      views.push(view);
    }
  }
  if (entries.length)
    await env.RADAR_SNAPSHOTS.put(
      `country:${country}`,
      `{${entries.join(",")}}`,
      { expirationTtl: 7200 },
    );
  if (!views.length)
    return { status: "empty", reason: "no_usable_views", country, views };
  return {
    status: views.length === radarViewIds.length ? "complete" : "partial",
    country,
    views,
  };
}
