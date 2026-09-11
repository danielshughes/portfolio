// Authored provider envelopes for local tests, never captured observations.
export const radarFixtureTime = Date.parse("2026-09-10T14:00:00Z");
export function radarUpstream(url, failDimension, descriptions = []) {
  const target = new URL(url);
  const path = target.pathname;
  if (failDimension && path.endsWith(failDimension))
    return new Response(null, { status: 503 });
  const start = radarFixtureTime - 7 * 86400000;
  const meta = {
    normalization: "PERCENTAGE",
    aggInterval: "ONE_HOUR",
    dateRange: [
      {
        startTime: new Date(start).toISOString(),
        endTime: new Date(radarFixtureTime).toISOString(),
      },
    ],
    lastUpdated: new Date(radarFixtureTime).toISOString(),
    confidenceInfo: { level: null, annotations: [] },
  };
  if (path.endsWith("annotations/outages"))
    return Response.json({
      success: true,
      result: {
        annotations: descriptions.map((description, index) => ({
          eventType: "OUTAGE",
          locations: [target.searchParams.get("location")],
          id: `fixture-${index}`,
          startDate: new Date(radarFixtureTime - 86400000).toISOString(),
          endDate: new Date(radarFixtureTime - 3600000).toISOString(),
          description,
          scope: "COUNTRY",
        })),
      },
    });
  if (path.endsWith("timeseries"))
    return Response.json({
      success: true,
      result: {
        serie_0: {
          timestamps: Array.from({ length: 168 }, (_, i) =>
            new Date(start + i * 3600000).toISOString(),
          ),
          values: Array(168).fill("0.5"),
        },
        meta: { ...meta, normalization: "MIN0_MAX" },
      },
    });
  return Response.json({
    success: true,
    result: { summary_0: { observed: "100" }, meta },
  });
}
