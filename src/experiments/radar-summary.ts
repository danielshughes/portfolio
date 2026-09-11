export interface RadarSummary {
  mode: "radar";
  country: string;
  view: string;
  categories: { label: string; value: number }[];
  window: { start: string; end: string };
  updatedAt: string;
  confidence: { level: number | null; annotationCount: number };
}
export function isRadarSummary(
  body: unknown,
  country: string,
  view: string,
): body is RadarSummary {
  if (!body || typeof body !== "object") return false;
  const b = body as RadarSummary;
  return (
    b.mode === "radar" &&
    b.country === country &&
    b.view === view &&
    !!b.window &&
    [b.window.start, b.window.end, b.updatedAt].every(
      (s) => typeof s === "string" && Number.isFinite(Date.parse(s)),
    ) &&
    !!b.confidence &&
    (b.confidence.level === null ||
      (typeof b.confidence.level === "number" &&
        b.confidence.level >= 0 &&
        b.confidence.level <= 5)) &&
    Number.isInteger(b.confidence.annotationCount) &&
    b.confidence.annotationCount >= 0 &&
    Array.isArray(b.categories) &&
    b.categories.length > 0 &&
    b.categories.length <= 12 &&
    b.categories.every(
      (c) =>
        c &&
        typeof c.label === "string" &&
        c.label.length <= 60 &&
        typeof c.value === "number" &&
        Number.isFinite(c.value) &&
        c.value >= 0 &&
        c.value <= 100,
    ) &&
    Math.abs(b.categories.reduce((sum, c) => sum + c.value, 0) - 100) < 0.11
  );
}
