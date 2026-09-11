import test from "node:test";
import assert from "node:assert/strict";
import {
  countries,
  pointAt,
  eventsAt,
  chartPath,
  project,
} from "./internet-model.ts";

test("supported countries have unique codes and bounded map coordinates", () => {
  assert.equal(
    new Set(countries.map(({ code }) => code)).size,
    countries.length,
  );
  for (const country of countries) {
    assert.match(country.code, /^[A-Z]{2}$/);
    assert.ok(country.lat >= -90 && country.lat <= 90);
    assert.ok(country.lon >= -180 && country.lon <= 180);
  }
});

test("cursor clamps to the available window and never turns missing data into zero", () => {
  assert.equal(pointAt([10, null, 30], -2), 10);
  assert.equal(pointAt([10, null, 30], 1), null);
  assert.equal(pointAt([10, null, 30], 99), 30);
  assert.equal(pointAt([], 0), null);
});

test("disruption intervals include start but exclude end", () => {
  const events = [
    { start: 72, end: 78, description: "Authored interval fixture" },
  ];
  assert.equal(eventsAt(events, 71).length, 0);
  assert.equal(eventsAt(events, 72).length, 1);
  assert.equal(eventsAt(events, 78).length, 0);
});

test("the chart breaks its line across missing values", () => {
  const line = chartPath([0, 100, null, 50], 300, 100);
  assert.equal((line.match(/M/g) ?? []).length, 2);
  assert.ok(!line.includes("NaN"));
  assert.equal(chartPath([], 300, 100), "");
});

test("geographic projection uses the map view box", () => {
  assert.deepEqual(project(0, 0), [360, 180]);
  assert.deepEqual(project(180, 90), [720, 0]);
});
