import test from "node:test";
import assert from "node:assert/strict";
import {
  countries,
  sampleWeek,
  pointAt,
  eventsAt,
  chartPath,
  project,
} from "./internet-model.ts";

test("sample weeks are deterministic, bounded and never claim real observations", () => {
  for (const country of countries) {
    const week = sampleWeek(country.code);
    assert.equal(week.mode, "sample");
    assert.deepEqual(week, sampleWeek(country.code));
    assert.equal(week.values.length, 168);
    assert.ok(
      week.values.every(
        (value) => value === null || (value >= 0 && value <= 100),
      ),
    );
  }
  assert.throws(() => sampleWeek("XX"));
});

test("cursor clamps to the available window and never turns missing data into zero", () => {
  assert.equal(pointAt([10, null, 30], -2), 10);
  assert.equal(pointAt([10, null, 30], 1), null);
  assert.equal(pointAt([10, null, 30], 99), 30);
  assert.equal(pointAt([], 0), null);
});

test("disruption intervals include start but exclude end", () => {
  const week = sampleWeek("JP");
  assert.equal(eventsAt(week.events, 71).length, 0);
  assert.equal(eventsAt(week.events, 72).length, 1);
  assert.equal(eventsAt(week.events, 78).length, 0);
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
