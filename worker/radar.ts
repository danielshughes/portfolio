import { countries } from "../src/experiments/internet-model.ts";

const HOUR = 3_600_000;
const MAX_BODY = 262_144;
const MAX_EVENTS = 100;
const CACHE_SECONDS = 3600;
const TIMEOUT_MS = 10_000;
const dimensions: Record<string, string> = {
  bots: "BOT_CLASS",
  devices: "DEVICE_TYPE",
  protocols: "HTTP_VERSION",
};

function summary(value: unknown) {
  const body = result(value),
    meta = object(body.meta);
  if (meta.normalization !== "PERCENTAGE") throw new Error("Invalid units");
  const range = object(array(meta.dateRange, 1)[0]);
  const start = stamp(range.startTime),
    end = stamp(range.endTime);
  if (end - start !== 168 * HOUR) throw new Error("Invalid window");
  const entries = Object.entries(object(body.summary_0));
  if (!entries.length || entries.length > 12)
    throw new Error("Invalid categories");
  const categories = entries.map(([label, raw]) => {
    text(label, 60);
    if (typeof raw !== "string" || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(raw))
      throw new Error("Invalid percentage");
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100)
      throw new Error("Invalid percentage");
    return { label, value };
  });
  if (
    Math.abs(categories.reduce((sum, item) => sum + item.value, 0) - 100) > 0.1
  )
    throw new Error("Incomplete breakdown");
  const confidence = object(meta.confidenceInfo);
  if (
    confidence.level !== null &&
    (typeof confidence.level !== "number" ||
      !Number.isFinite(confidence.level) ||
      confidence.level < 0 ||
      confidence.level > 5)
  )
    throw new Error("Invalid confidence");
  return {
    categories,
    window: { start: iso(start), end: iso(end) },
    updatedAt: iso(stamp(meta.lastUpdated)),
    confidence: {
      level: confidence.level,
      annotationCount: array(confidence.annotations, 100).length,
    },
  };
}

export interface RadarOptions {
  enabled: boolean;
  ingress?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  upstream?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  token?: string;
  now: () => number;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  cache: {
    match(key: string): Promise<Response | undefined>;
    put(key: string, response: Response): Promise<void>;
  };
  reportFailure?: (stage: string, kind: string) => void;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid object");
  return value as Record<string, unknown>;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Invalid array");
  return value;
}
function stamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  )
    throw new Error("Invalid timestamp");
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("Invalid timestamp");
  return time;
}
const iso = (time: number) => new Date(time).toISOString();
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Invalid text");
  return value;
}
function result(value: unknown) {
  const body = object(value);
  if (body.success !== true) throw new Error("Upstream rejected request");
  return object(body.result);
}

function traffic(value: unknown) {
  const body = result(value),
    meta = object(body.meta),
    series = object(body.serie_0);
  if (meta.normalization !== "MIN0_MAX" || meta.aggInterval !== "ONE_HOUR")
    throw new Error("Unsupported data");
  const ranges = array(meta.dateRange, 1);
  const range = object(ranges[0]);
  const start = stamp(range.startTime),
    end = stamp(range.endTime);
  if (end - start !== 168 * HOUR || start % HOUR !== 0)
    throw new Error("Unexpected window");
  const times = array(series.timestamps, 168),
    readings = array(series.values, 168);
  if (times.length !== readings.length || times.length === 0)
    throw new Error("Invalid series");
  const values: (number | null)[] = Array(168).fill(null);
  let previous = -Infinity;
  for (let i = 0; i < times.length; i++) {
    const time = stamp(times[i]);
    if (
      time <= previous ||
      time < start ||
      time >= end ||
      (time - start) % HOUR !== 0
    )
      throw new Error("Unexpected sample time");
    previous = time;
    const raw = readings[i];
    if (raw === null) continue;
    if (!(
      typeof raw === "number" ||
      (typeof raw === "string" && /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(raw))
    ))
      throw new Error("Invalid reading");
    const ratio = Number(raw);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)
      throw new Error("Invalid ratio");
    values[(time - start) / HOUR] = Math.round(ratio * 10000) / 100;
  }
  const info = meta.confidenceInfo == null ? {} : object(meta.confidenceInfo);
  const level = info.level ?? null;
  if (
    level !== null &&
    (typeof level !== "number" ||
      !Number.isInteger(level) ||
      level < 0 ||
      level > 5)
  )
    throw new Error("Invalid confidence");
  return {
    window: { start: iso(start), end: iso(end) },
    timestamps: Array.from({ length: 168 }, (_, i) => iso(start + i * HOUR)),
    values,
    updatedAt: iso(stamp(meta.lastUpdated)),
    confidence: {
      level,
      annotationCount:
        info.annotations == null ? 0 : array(info.annotations, 100).length,
    },
  };
}

function annotations(
  value: unknown,
  country: string,
  window: { start: string; end: string },
) {
  const items = array(result(value).annotations, MAX_EVENTS);
  const outages = items
    .map((item) => {
      const event = object(item);
      if (event.eventType !== "OUTAGE")
        throw new Error("Unsupported annotation");
      const locations = array(event.locations, 250);
      if (!locations.includes(country)) throw new Error("Mismatched location");
      const start = stamp(event.startDate),
        end = event.endDate == null ? null : stamp(event.endDate);
      if (end !== null && end <= start)
        throw new Error("Invalid event interval");
      return {
        id: text(event.id, 128),
        start: iso(start),
        end: end === null ? null : iso(end),
        description: text(event.description, 2000),
        scope: text(event.scope, 100),
      };
    })
    .filter(
      (event) =>
        stamp(event.start) < stamp(window.end) &&
        (event.end === null || stamp(event.end) > stamp(window.start)),
    );
  return { outages, outagesTruncated: items.length === MAX_EVENTS };
}

class RateLimit extends Error {
  seconds: number;
  constructor(seconds: number) {
    super("Radar rate limit");
    this.seconds = seconds;
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  if (
    !response.body ||
    Number(response.headers.get("content-length")) > MAX_BODY
  ) {
    await response.body?.cancel();
    throw new Error("Invalid body size");
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  );
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export async function handleRadar(
  request: Request,
  options: RadarOptions,
): Promise<Response> {
  // Constant keys cap optional anonymous data per location without recording
  // visitor identity. Missing or broken protection must never admit traffic.
  try {
    if (!options.ingress) return json({ error: "radar_unavailable" }, 503);
    if (!(await options.ingress.limit({ key: "radar-ingress" })).success)
      return json({ error: "radar_rate_limited" }, 429, {
        "retry-after": "60",
      });
  } catch {
    return json({ error: "radar_unavailable" }, 503);
  }
  if (request.method !== "GET")
    return json({ error: "method_not_allowed" }, 405, { allow: "GET" });
  const url = new URL(request.url),
    entries = [...url.searchParams];
  const country = url.searchParams.get("country");
  const view = url.searchParams.get("view") ?? "traffic";
  if (
    url.searchParams.getAll("country").length !== 1 ||
    url.searchParams.getAll("view").length > 1 ||
    entries.some(([key]) => !["country", "view"].includes(key)) ||
    !["traffic", ...Object.keys(dimensions)].includes(view) ||
    !countries.some((item) => item.code === country)
  )
    return json({ error: "invalid_country" }, 400);
  if (!options.enabled || !options.token)
    return json({ error: "radar_disabled" }, 503);
  const key = new URL(`/api/.radar/v2/${country}/${view}`, url).href;
  const backoffKey = new URL("/api/.radar/v1/backoff", url).href;
  let stage = "cache_read";
  try {
    const cached = await options.cache.match(key);
    if (cached) return cached;
    const backoff = await options.cache.match(backoffKey);
    if (backoff) {
      const until = Number(backoff.headers.get("x-retry-at"));
      if (!Number.isFinite(until) || until <= 0)
        throw new Error("Invalid backoff");
      if (until > options.now())
        return json(
          {
            error:
              backoff.headers.get("x-backoff-kind") === "failure"
                ? "radar_unavailable"
                : "radar_rate_limited",
          },
          backoff.headers.get("x-backoff-kind") === "failure" ? 502 : 429,
          {
            "retry-after": String(Math.ceil((until - options.now()) / 1000)),
          },
        );
    }
    try {
      if (!options.upstream) return json({ error: "radar_unavailable" }, 503);
      if (!(await options.upstream.limit({ key: "radar-cold" })).success)
        return json({ error: "radar_rate_limited" }, 429, {
          "retry-after": "60",
        });
    } catch {
      return json({ error: "radar_unavailable" }, 503);
    }
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const get = async (path: string, params: Record<string, string>) => {
      stage = `fetch_${path}`;
      const target = new URL(
        `https://api.cloudflare.com/client/v4/radar/${path}`,
      );
      target.search = new URLSearchParams({
        ...params,
        location: country!,
        format: "json",
      }).toString();
      const response = await options.fetch(target.href, {
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: "application/json",
        },
        // Workers supports manual/follow, not the browser's error mode.
        // Reject every non-2xx response below, without following redirects.
        redirect: "manual",
        signal,
      });
      if (response.status === 429) {
        const retry = response.headers.get("retry-after") ?? "60";
        const seconds = /^\d+$/.test(retry)
          ? Number(retry)
          : (Date.parse(retry) - options.now()) / 1000;
        await response.body?.cancel();
        throw new RateLimit(
          Number.isFinite(seconds)
            ? Math.min(86400, Math.max(1, Math.ceil(seconds)))
            : 60,
        );
      }
      if (!response.ok) {
        stage = `http_${response.status}`;
        await response.body?.cancel();
        throw new Error("Radar unavailable");
      }
      stage = `decode_${path}`;
      return boundedJson(response);
    };
    let payload;
    if (view !== "traffic") {
      payload = summary(
        await get(`http/summary/${dimensions[view]}`, { dateRange: "7d" }),
      );
    } else {
      const series = traffic(
        await get("http/timeseries", {
          dateRange: "7d",
          aggInterval: "1h",
          normalization: "MIN0_MAX",
        }),
      );
      const events = annotations(
        await get("annotations/outages", {
          dateStart: series.window.start,
          dateEnd: series.window.end,
          limit: String(MAX_EVENTS),
        }),
        country!,
        series.window,
      );
      payload = { ...series, ...events };
    }
    const response = json(
      {
        mode: "radar",
        country,
        view,
        source: "Cloudflare Radar",
        sourceUrl: "https://radar.cloudflare.com/",
        normalisation:
          view === "traffic"
            ? "Within-country peak = 100; not absolute traffic volume"
            : "Percentage of observed HTTP requests",
        fetchedAt: iso(options.now()),
        ...payload,
      },
      200,
      { "cache-control": `public, max-age=${CACHE_SECONDS}` },
    );
    stage = "cache_write";
    await options.cache.put(key, response.clone());
    return response;
  } catch (error) {
    options.reportFailure?.(
      stage,
      error instanceof TypeError
        ? [
            "type_error",
            ...[
              "redirect",
              "signal",
              "header",
              "invocation",
              "network",
              "request",
              "fetch",
            ].filter((term) => error.message.toLowerCase().includes(term)),
          ].join("_")
        : error instanceof Error && /certificate|tls/i.test(error.message)
          ? "tls_error"
          : "data_or_network_error",
    );
    const limited = error instanceof RateLimit;
    const seconds = limited ? error.seconds : 30;
    if (!stage.startsWith("cache_")) {
      try {
        await options.cache.put(
          backoffKey,
          new Response(null, {
            headers: {
              "cache-control": `max-age=${seconds}`,
              "x-retry-at": String(options.now() + seconds * 1000),
              "x-backoff-kind": limited ? "limit" : "failure",
            },
          }),
        );
      } catch {
        /* Fail closed even when caching is unavailable. */
      }
    }
    return json(
      { error: limited ? "radar_rate_limited" : "radar_unavailable" },
      limited ? 429 : 502,
      { "retry-after": String(seconds) },
    );
  }
}
