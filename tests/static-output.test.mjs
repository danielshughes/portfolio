import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const buildDirectory = new URL("../dist/", import.meta.url);

test("build emits the required static page contract", () => {
  rmSync(buildDirectory, { recursive: true, force: true });

  const build = spawnSync("npm", ["run", "build"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      SITE_URL: "https://portfolio.example.test",
    },
  });

  assert.equal(
    build.status,
    0,
    `Astro build failed:\n${build.stdout}\n${build.stderr}`,
  );

  const html = readFileSync(new URL("index.html", buildDirectory), "utf8");

  assert.match(html, /<h1[^>]*>Observability &amp; SRE Leader<\/h1>/);
  assert.match(html, /<main(?:\s|>)/);
  assert.doesNotMatch(html, /<astro-island(?:\s|>)/);
});
