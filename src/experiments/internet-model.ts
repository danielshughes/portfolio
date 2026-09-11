export const countries = [
  { code: "GB", name: "United Kingdom", short: "UK", lat: 54, lon: -2 },
  { code: "US", name: "United States", short: "US", lat: 39, lon: -99 },
  { code: "BR", name: "Brazil", short: "BR", lat: -14, lon: -52 },
  { code: "DE", name: "Germany", short: "DE", lat: 51, lon: 10 },
  { code: "IN", name: "India", short: "IN", lat: 22, lon: 79 },
  { code: "JP", name: "Japan", short: "JP", lat: 37, lon: 138 },
  { code: "ZA", name: "South Africa", short: "ZA", lat: -29, lon: 25 },
  { code: "AU", name: "Australia", short: "AU", lat: -25, lon: 134 },
] as const;

export interface EventInterval {
  start: number;
  end: number;
  description: string;
}

export function project(lon: number, lat: number): [number, number] {
  return [(lon + 180) * 2, (90 - lat) * 2];
}

export function pointAt(values: (number | null)[], index: number) {
  return (
    values[Math.max(0, Math.min(values.length - 1, Math.round(index)))] ?? null
  );
}

export function eventsAt(events: EventInterval[], hour: number) {
  return events.filter((event) => hour >= event.start && hour < event.end);
}

export function chartPath(
  values: (number | null)[],
  width = 640,
  height = 160,
) {
  let penDown = false;
  return values
    .map((value, index) => {
      if (value === null) {
        penDown = false;
        return "";
      }
      const command = penDown ? "L" : "M";
      penDown = true;
      return `${command}${((index / Math.max(values.length - 1, 1)) * width).toFixed(2)},${(height - (value / 100) * height).toFixed(2)}`;
    })
    .join("");
}
