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

export interface SampleEvent {
  start: number;
  end: number;
  description: string;
}
export interface SampleWeek {
  mode: "sample";
  values: (number | null)[];
  events: SampleEvent[];
}

export function sampleWeek(code: string): SampleWeek {
  const country = countries.findIndex((country) => country.code === code);
  if (country < 0) throw new Error("Unsupported sample country");
  return {
    mode: "sample",
    values: Array.from({ length: 168 }, (_, hour) => {
      if (hour >= 110 && hour < 113) return null;
      const day = Math.sin(((hour + country * 3) / 24) * Math.PI * 2);
      const small = Math.cos(hour * 1.3 + country) * 3;
      const dip = hour >= 72 && hour < 78 ? 0.35 : 1;
      return Math.round((72 + day * 20 + small) * dip);
    }),
    events: [{ start: 72, end: 78, description: "Illustrative disruption" }],
  };
}

export function project(lon: number, lat: number): [number, number] {
  return [(lon + 180) * 2, (90 - lat) * 2];
}

export function pointAt(values: (number | null)[], index: number) {
  return (
    values[Math.max(0, Math.min(values.length - 1, Math.round(index)))] ?? null
  );
}

export function eventsAt(events: SampleEvent[], hour: number) {
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
