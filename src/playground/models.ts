/** Synthetic teaching models, not measurements or capacity predictions. */
export function percentile(values: number[], p: number): number {
  if (
    !values.length ||
    !values.every(Number.isFinite) ||
    !Number.isFinite(p) ||
    p < 0 ||
    p > 100
  )
    throw new RangeError("Invalid percentile input");
  const sorted = [...values].sort((a, b) => a - b);
  const position = ((sorted.length - 1) * p) / 100;
  const lower = Math.floor(position),
    upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function latencies(tail: number): number[] {
  if (!Number.isFinite(tail) || tail < 100 || tail > 2000)
    throw new RangeError("Tail must be between 100 and 2000 ms");
  return Array.from({ length: 100 }, (_, i) =>
    i < 90 ? 35 + ((i * 17) % 55) : tail * (0.9 + (i - 90) / 90),
  );
}

export function schedule(
  concurrency: number,
  latency: number,
  deadline: number,
) {
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 6 ||
    !Number.isFinite(latency) ||
    latency <= 0 ||
    !Number.isFinite(deadline) ||
    deadline <= 0
  )
    throw new RangeError("Invalid request settings");
  return Array.from({ length: 12 }, (_, i) => {
    const start = Math.floor(i / concurrency) * latency;
    const end = start + latency;
    return { start, end, completed: end <= deadline };
  });
}
