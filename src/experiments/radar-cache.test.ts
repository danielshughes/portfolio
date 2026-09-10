import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRadarCache,
  RadarBackoffError,
  RADAR_REUSE_MS,
  RADAR_PREFETCH_BUDGET,
} from "./radar-cache.ts";

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness() {
  let now = 0;
  const calls: {
    key: string;
    signal: AbortSignal;
    resolve: (value: number) => void;
    reject: (error: Error) => void;
  }[] = [];
  const cache = createRadarCache<number>(
    (key, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ key, signal, resolve, reject });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    () => now,
  );
  return {
    cache,
    calls,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test("successful results retain value, deduplicate and expire after the reuse window", async () => {
  const { cache, calls, advance } = harness();
  const one = cache.get("GB:traffic"),
    two = cache.get("GB:traffic");
  assert.equal(calls.length, 1);
  calls[0].resolve(50);
  assert.deepEqual(await Promise.all([one, two]), [50, 50]);
  assert.equal(await cache.get("GB:traffic"), 50);
  assert.equal(calls.length, 1);
  advance(RADAR_REUSE_MS);
  assert.equal(cache.peek("GB:traffic"), undefined);
  const fresh = cache.get("GB:traffic");
  calls[1].resolve(60);
  assert.equal(await fresh, 60);
});
test("speculation is serial and document-budgeted, with foreground priority and promotion", async () => {
  const { cache, calls } = harness();
  cache.setExploring(true);
  cache.prefetch(["GB:bots", "GB:bots", "JP:traffic"]);
  assert.equal(calls.length, 1);
  const promoted = cache.get("GB:bots");
  assert.equal(calls.length, 1);
  const foreground = cache.get("AU:devices");
  assert.equal(calls.length, 2);
  calls[0].resolve(1);
  await promoted;
  await turn();
  assert.equal(calls.length, 2);
  calls[1].resolve(2);
  await foreground;
  await turn();
  assert.equal(calls[2].key, "JP:traffic");
  calls[2].resolve(3);
  await turn();
  for (let i = 0; i < 20; i++) {
    cache.prefetch([`key-${i}`]);
    calls.at(-1)!.resolve(i);
    await turn();
  }
  assert.equal(calls.length, RADAR_PREFETCH_BUDGET + 1);
});
test("inactive exploration cancels queued and pending speculation but never a promoted foreground", async () => {
  const { cache, calls } = harness();
  cache.prefetch(["GB:bots"]);
  assert.equal(calls.length, 0);
  cache.setExploring(true);
  cache.prefetch(["GB:bots", "JP:traffic"]);
  cache.setExploring(false);
  assert.equal(calls[0].signal.aborted, true);
  await turn();
  cache.setExploring(true);
  await turn();
  assert.equal(calls.length, 1);
  cache.prefetch(["GB:devices"]);
  const result = cache.get("GB:devices");
  cache.setExploring(false);
  assert.equal(calls[1].signal.aborted, false);
  calls[1].resolve(70);
  assert.equal(await result, 70);
});
test("failed speculative responses never cache or automatically retry; foreground can retry", async () => {
  const { cache, calls } = harness();
  cache.setExploring(true);
  cache.prefetch(["GB:bots"]);
  calls[0].reject(new Error("invalid response"));
  await turn();
  assert.equal(cache.peek("GB:bots"), undefined);
  cache.prefetch(["GB:bots"]);
  assert.equal(calls.length, 1);
  const retry = cache.get("GB:bots");
  calls[1].resolve(65);
  assert.equal(await retry, 65);
});
test("origin backoff stops all document speculation without preventing an explicit foreground retry", async () => {
  const { cache, calls } = harness();
  cache.setExploring(true);
  cache.prefetch(["GB:bots", "JP:traffic"]);
  calls[0].reject(new RadarBackoffError("Retry later"));
  await turn();
  cache.prefetch(["GB:devices"]);
  await turn();
  assert.equal(calls.length, 1);
  const retry = cache.get("GB:bots");
  calls[1].resolve(65);
  assert.equal(await retry, 65);
});
