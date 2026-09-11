import assert from "node:assert/strict";
import test from "node:test";
import { edgeDetails } from "./edge.ts";

test("edge metadata exposes only bounded, non-identifying observations", () => {
  const data = edgeDetails({
    country: "GB",
    colo: "LHR",
    httpProtocol: "HTTP/3",
    tlsVersion: "TLSv1.3",
    clientTcpRtt: 0,
    clientQuicRtt: 14,
    asn: 123,
    asOrganization: "Example network",
    latitude: "51.5",
    longitude: "-0.1",
    city: "London",
    ip: "private",
    tlsClientAuth: { certSubjectDN: "private" },
  });
  assert.deepEqual(data, {
    country: "GB",
    colo: "LHR",
    protocol: "HTTP/3",
    tls: "TLSv1.3",
    roundTripMs: 14,
    network: "Example network",
  });
  assert.deepEqual(edgeDetails(undefined), {
    country: null,
    colo: null,
    protocol: null,
    tls: null,
    roundTripMs: null,
    network: null,
  });
});
test("invalid and absent metadata is unavailable, never guessed", () => {
  const data = edgeDetails({
    country: "XX-invalid",
    colo: "script",
    httpProtocol: "<html>",
    tlsVersion: "unknown",
    clientTcpRtt: -1,
    asOrganization: "x".repeat(121),
  });
  assert.ok(Object.values(data).every((v) => v === null));
});
