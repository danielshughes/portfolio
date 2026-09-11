const boundedText = (value: unknown, max: number) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  !/[<>\x00-\x1f]/.test(value)
    ? value
    : null;

export function edgeDetails(cf?: Record<string, unknown>) {
  const protocol = ["HTTP/1.0", "HTTP/1.1", "HTTP/2", "HTTP/3"].includes(
    String(cf?.httpProtocol),
  )
    ? String(cf?.httpProtocol)
    : null;
  const rawTiming =
    protocol === "HTTP/3" ? cf?.clientQuicRtt : cf?.clientTcpRtt;
  return {
    country:
      typeof cf?.country === "string" && /^[A-Z]{2}$/.test(cf.country)
        ? cf.country
        : null,
    colo:
      typeof cf?.colo === "string" && /^[A-Z]{3}$/.test(cf.colo)
        ? cf.colo
        : null,
    protocol,
    tls: /^TLSv1\.[23]$/.test(String(cf?.tlsVersion))
      ? String(cf?.tlsVersion)
      : null,
    roundTripMs:
      typeof rawTiming === "number" &&
      Number.isFinite(rawTiming) &&
      rawTiming > 0 &&
      rawTiming <= 60000
        ? Math.round(rawTiming)
        : null,
    network: boundedText(cf?.asOrganization, 120),
  };
}
