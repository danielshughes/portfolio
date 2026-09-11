// Authored contract data, never a recording of Radar observations.
export function radar(country = "GB") {
  return {
    mode: "radar",
    country,
    view: "traffic",
    source: "Cloudflare Radar",
    window: { start: "2026-09-03T13:00:00Z", end: "2026-09-10T13:00:00Z" },
    timestamps: Array.from({ length: 168 }, (_, i) =>
      new Date(Date.parse("2026-09-03T13:00:00Z") + i * 3600000).toISOString(),
    ),
    values: Array.from({ length: 168 }, (_, i) => (i === 110 ? null : 50)),
    updatedAt: "2026-09-10T13:45:00Z",
    fetchedAt: "2026-09-10T14:00:00Z",
    confidence: { level: null, annotationCount: 0 },
    outages: [],
    outagesTruncated: false,
  };
}
