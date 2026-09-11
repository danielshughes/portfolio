import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { siteEnvironment } from "./scripts/site-environment.mjs";
import { writeBuildPolicy } from "./scripts/build-policy.mjs";

const environment = siteEnvironment();

export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  site: environment.origin,
  integrations: [
    {
      name: "build-security-policy",
      hooks: {
        "astro:build:done": ({ dir }) => writeBuildPolicy(fileURLToPath(dir)),
      },
    },
  ],
  vite: {
    plugins: [
      {
        name: "optional-import-recovery",
        apply: "build",
        configEnvironment(name) {
          if (name !== "client") return;
          return {
            build: {
              modulePreload: {
                // Astro replaces top-level build settings, so apply this to
                // its client environment. WebKit retains failed preloads:
                // https://bugs.webkit.org/show_bug.cgi?id=270357
                // Keep entry preloads; optional imports load normally.
                resolveDependencies: (_filename, dependencies, { hostType }) =>
                  hostType === "js" ? [] : dependencies,
              },
            },
          };
        },
      },
    ],
    server: {
      proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } },
    },
  },
});
