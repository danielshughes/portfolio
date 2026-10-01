import { loadAndParseConfig } from "@cloudflare/config";

// The native loader resolves cf-worker imports without executing Worker code.
const configurations = {};
for (const mode of ["development", "production"]) {
  const { result } = await loadAndParseConfig(
    new URL("../cloudflare.config.ts", import.meta.url).pathname,
    { mode },
  );
  if (!result.success)
    throw new Error("Invalid Cloudflare project configuration");
  configurations[mode] = result.data;
}
export function portfolioConfig(mode) {
  if (!Object.hasOwn(configurations, mode))
    throw new Error("Cloudflare mode must be development or production");
  return configurations[mode];
}
