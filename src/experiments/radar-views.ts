// Stable data contract only: no DOM dependencies or presentation copy.
export const radarDimensions = {
  traffic: null,
  bots: "BOT_CLASS",
  devices: "DEVICE_TYPE",
  protocols: "HTTP_VERSION",
} as const;

export type RadarView = keyof typeof radarDimensions;
export const radarViewIds = Object.keys(radarDimensions) as RadarView[];

export function isRadarView(value: unknown): value is RadarView {
  return typeof value === "string" && Object.hasOwn(radarDimensions, value);
}
