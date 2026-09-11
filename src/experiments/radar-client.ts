export interface RadarData {
  mode: "radar";
  country: string;
  values: (number | null)[];
  timestamps: string[];
  updatedAt: string;
  fetchedAt: string;
  window: { start: string; end: string };
  confidence: { level: number | null; annotationCount: number };
  outages: {
    id: string;
    start: string;
    end: string | null;
    description: string;
    scope: string;
  }[];
  outagesTruncated: boolean;
}

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function isRadarData(v: unknown, country: string): v is RadarData {
  if (
    !record(v) ||
    v.mode !== "radar" ||
    v.country !== country ||
    !record(v.window) ||
    !record(v.confidence)
  )
    return false;
  return (
    Array.isArray(v.values) &&
    v.values.length === 168 &&
    v.values.every(
      (n) =>
        n === null ||
        (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100),
    ) &&
    Array.isArray(v.timestamps) &&
    v.timestamps.length === 168 &&
    v.timestamps.every(date) &&
    date(v.updatedAt) &&
    date(v.fetchedAt) &&
    date(v.window.start) &&
    date(v.window.end) &&
    (v.confidence.level === null ||
      (typeof v.confidence.level === "number" &&
        v.confidence.level >= 0 &&
        v.confidence.level <= 5)) &&
    typeof v.confidence.annotationCount === "number" &&
    typeof v.outagesTruncated === "boolean" &&
    Array.isArray(v.outages) &&
    v.outages.length <= 100 &&
    v.outages.every(
      (e) =>
        record(e) &&
        typeof e.id === "string" &&
        date(e.start) &&
        (e.end === null || date(e.end)) &&
        typeof e.description === "string" &&
        typeof e.scope === "string",
    )
  );
}

export const radarTime = (stamp: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(stamp)) + " UTC";

export function radarMetadata(
  data: Pick<RadarData, "updatedAt" | "confidence">,
) {
  const parts = [`Updated ${radarTime(data.updatedAt)}`];
  if (data.confidence.level !== null)
    parts.push(`Confidence ${data.confidence.level}/5`);
  if (data.confidence.annotationCount)
    parts.push("Source quality annotations present");
  return parts.join(". ") + ".";
}
