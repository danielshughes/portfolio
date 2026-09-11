import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

function build(environment = {}) {
  const env = { ...process.env };
  delete env.SITE_ENV;
  delete env.SITE_URL;
  return spawnSync("npm", ["run", "build"], {
    env: { ...env, ...environment },
    encoding: "utf8",
  });
}
function withDevelopmentOutput(run, restore = build) {
  let primaryError;
  try {
    return run();
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      const result = restore();
      assert.equal(
        result.status,
        0,
        result.stderr || "restore safe development output",
      );
    } catch (restorationError) {
      if (primaryError)
        throw new AggregateError(
          [primaryError, restorationError],
          "Production check and development restoration both failed",
        );
      throw restorationError;
    }
  }
}
test("default development output is non-indexable and hashes executable inline scripts", () => {
  const result = build();
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(readFileSync("dist/robots.txt", "utf8"), /Disallow: \/\s*$/);
  const headers = readFileSync("dist/_headers", "utf8");
  assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
  assert.doesNotMatch(headers, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
  for (const page of ["index", "notes/index", "experiments/index"]) {
    const content = readFileSync(`dist/${page}.html`, "utf8");
    for (const [, attributes, script] of content.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      if (/\bsrc=/.test(attributes) || /application\/ld\+json/.test(attributes))
        continue;
      assert.ok(
        headers.includes(
          `'sha256-${createHash("sha256").update(script).digest("base64")}'`,
        ),
      );
    }
    assert.match(
      content,
      /target="_blank"[^>]*rel="me noopener noreferrer"[^>]*aria-describedby="footer-new-tab"/,
    );
  }
});
test("unknown environment and unsafe production origins fail before output", () => {
  for (const environment of [
    { SITE_ENV: "staging" },
    ...[
      undefined,
      "http://example.test",
      "https://user:pass@example.test",
      "https://@example.test",
      "https://example.test/path",
      "https://example.test/?x=1",
      "https://example.test/#x",
      "invalid",
    ].map((SITE_URL) => ({
      SITE_ENV: "production",
      ...(SITE_URL === undefined ? {} : { SITE_URL }),
    })),
  ])
    assert.notEqual(build(environment).status, 0, "unsafe build must fail");
});
test("production output uses the supplied origin and public metadata", () => {
  withDevelopmentOutput(() => {
    const result = build({
      SITE_ENV: "production",
      SITE_URL: "https://portfolio.example.test",
    });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync("dist/notes/index.html", "utf8");
    assert.match(
      html,
      /rel="canonical" href="https:\/\/portfolio.example.test\/notes\/"/,
    );
    assert.match(
      html,
      /property="og:url" content="https:\/\/portfolio.example.test\/notes\/"/,
    );
    assert.match(html, /application\/ld\+json/);
    const identity = JSON.parse(
      html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1],
    );
    assert.equal(identity["@type"], "Person");
    assert.deepEqual(identity.sameAs, [
      "https://www.linkedin.com/in/dan-hughes-796098108/",
    ]);
    assert.doesNotMatch(html, /noindex|og:image/);
    assert.match(
      readFileSync("dist/sitemap.xml", "utf8"),
      /https:\/\/portfolio.example.test\/experiments\//,
    );
    assert.doesNotMatch(readFileSync("dist/_headers", "utf8"), /noindex/);
  });
});

test("failed production assertions preserve their error and restore development output", () => {
  const fixtureError = new Error("Authored production assertion failure");
  try {
    assert.throws(
      () =>
        withDevelopmentOutput(() => {
          const result = build({
            SITE_ENV: "production",
            SITE_URL: "https://portfolio.example.test",
          });
          assert.equal(result.status, 0, result.stderr);
          assert.doesNotMatch(readFileSync("dist/_headers", "utf8"), /noindex/);
          throw fixtureError;
        }),
      (error) => error === fixtureError,
    );
    assert.match(
      readFileSync("dist/index.html", "utf8"),
      /name="robots" content="noindex, nofollow"/,
    );
    assert.match(
      readFileSync("dist/_headers", "utf8"),
      /X-Robots-Tag: noindex, nofollow/,
    );
    assert.match(readFileSync("dist/robots.txt", "utf8"), /Disallow: \/\s*$/);
  } finally {
    // Keep this deliberately failing fixture safe even if the restoration helper regresses.
    assert.equal(
      build().status,
      0,
      "restore development after the failure-path fixture",
    );
  }
});

test("restoration failures retain the original production failure too", () => {
  const primaryError = new Error("Authored production failure");
  assert.throws(
    () =>
      withDevelopmentOutput(
        () => {
          throw primaryError;
        },
        () => ({ status: 1, stderr: "Authored restoration failure" }),
      ),
    (error) =>
      error instanceof AggregateError &&
      error.errors[0] === primaryError &&
      /Authored restoration failure/.test(error.errors[1].message),
  );
});
