import { test } from "node:test";
import assert from "node:assert/strict";
import { percentile, latencies, schedule } from "./models.ts";

test("percentiles interpolate a sorted copy without changing the input", () => {
  const values = [40, 10, 30, 20];
  assert.equal(percentile(values, 50), 25);
  assert.equal(percentile(values, 0), 10);
  assert.equal(percentile(values, 100), 40);
  assert.deepEqual(values, [40, 10, 30, 20]);
  assert.throws(() => percentile([], 50));
  assert.throws(() => percentile([1], 101));
});

test("a slower tail changes high percentiles but not the typical request", () => {
  const fast = latencies(100),
    slow = latencies(1000);
  assert.equal(fast.length, 100);
  assert.deepEqual(latencies(100), fast);
  assert.ok(
    Math.min(...fast.slice(90)) > Math.max(...fast.slice(0, 90)),
    "the adjustable ten are always the slowest requests",
  );
  assert.equal(percentile(fast, 50), percentile(slow, 50));
  assert.ok(percentile(slow, 95) > percentile(fast, 95));
  assert.ok(percentile(slow, 99) > percentile(fast, 99));
});

test("bounded requests retain a whole-lookup deadline including queue time", () => {
  const serial = schedule(1, 200, 1000);
  const parallel = schedule(3, 200, 1000);
  assert.equal(serial.length, 12);
  assert.equal(serial.filter((r) => r.completed).length, 5);
  assert.equal(parallel.filter((r) => r.completed).length, 12);
  assert.equal(parallel.at(-1)?.end, 800);
  for (let t = 0; t < 800; t += 50) {
    assert.ok(parallel.filter((r) => r.start <= t && r.end > t).length <= 3);
  }
  assert.equal(schedule(1, 200, 200)[0].completed, true);
  assert.throws(() => schedule(0, 200, 1000));
  assert.throws(() => schedule(2, NaN, 1000));
});
