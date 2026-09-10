// Memory belongs to this document only. Source timestamps are never rewritten.
export const RADAR_REUSE_MS = 5 * 60 * 1000;
export const RADAR_PREFETCH_BUDGET = 12;
export class RadarBackoffError extends Error {}

export function createRadarCache<T>(
  load: (key: string, signal: AbortSignal) => Promise<T>,
  now: () => number = Date.now,
) {
  const values = new Map<string, { value: T; expires: number }>();
  const pending = new Map<
    string,
    {
      promise: Promise<T>;
      controller: AbortController;
      speculative: boolean;
    }
  >();
  const attempted = new Set<string>();
  let queue: string[] = [],
    exploring = false,
    spent = 0,
    backoff = false;

  function peek(key: string) {
    // Prune on use, without creating a refresh timer.
    for (const [name, entry] of values)
      if (entry.expires <= now()) values.delete(name);
    return values.get(key)?.value;
  }
  function start(key: string, speculative: boolean) {
    const controller = new AbortController();
    const entry = {
      controller,
      speculative,
      promise: undefined as unknown as Promise<T>,
    };
    const timeout = setTimeout(() => controller.abort(), 15000);
    entry.promise = load(key, controller.signal)
      .then((value) => {
        if (controller.signal.aborted)
          throw new Error("Radar request cancelled");
        values.set(key, { value, expires: now() + RADAR_REUSE_MS });
        return value;
      })
      .catch((error: unknown) => {
        if (error instanceof RadarBackoffError) {
          backoff = true;
          queue = [];
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timeout);
        if (pending.get(key) === entry) pending.delete(key);
        pump();
      });
    pending.set(key, entry);
    return entry.promise;
  }
  function pump() {
    // Foreground work always starts directly. Resume speculation only once it settles.
    if (!exploring || backoff || pending.size || spent >= RADAR_PREFETCH_BUDGET)
      return;
    const key = queue.shift();
    if (!key) return;
    if (peek(key) !== undefined || attempted.has(key)) {
      pump();
      return;
    }
    attempted.add(key);
    spent++;
    void start(key, true).catch(() => {});
  }
  return {
    peek,
    get(key: string): Promise<T> {
      queue = queue.filter((queued) => queued !== key);
      const cached = peek(key);
      if (cached !== undefined) return Promise.resolve(cached);
      const existing = pending.get(key);
      if (existing) {
        existing.speculative = false;
        return existing.promise;
      }
      return start(key, false);
    },
    setExploring(active: boolean) {
      exploring = active;
      if (!active) {
        queue = [];
        for (const [key, entry] of pending)
          if (entry.speculative) {
            pending.delete(key);
            entry.controller.abort();
          }
      } else pump();
    },
    prefetch(keys: string[]) {
      if (!exploring || backoff || spent >= RADAR_PREFETCH_BUDGET) return;
      // New intent takes priority over older queued candidates.
      queue = [...new Set([...keys, ...queue])]
        .filter(
          (key) =>
            !pending.has(key) && !attempted.has(key) && peek(key) === undefined,
        )
        .slice(0, RADAR_PREFETCH_BUDGET - spent);
      pump();
    },
  };
}
