import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
test("static output includes the narrative and working anchor destinations", () => {
  const build = spawnSync("npm", ["run", "build"], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const html = readFileSync("dist/index.html", "utf8");
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const id of ["main-content", "work", "contact"])
    assert.ok(html.includes('id="' + id + '"'));
  assert.ok(html.includes("MCP servers"));
  assert.ok(!html.includes("<astro-island"));
  for (const path of [
    "dist/index.html",
    "dist/notes/index.html",
    "dist/experiments/index.html",
  ]) {
    const page = readFileSync(path, "utf8");
    assert.match(
      page,
      /<head>\s*<meta charset="UTF-8"\s*\/?>\s*<meta name="viewport"/,
    );
    const charsetEnd =
      page.indexOf(">", page.indexOf('<meta charset="UTF-8"')) + 1;
    assert.ok(Buffer.byteLength(page.slice(0, charsetEnd)) <= 1024);
    assert.ok(page.includes('lang="en-GB"'));
    assert.equal((page.match(/<h1\b/g) || []).length, 1);
    assert.ok(!page.includes("Engineering notes"));
    assert.ok(
      !/\u2014|&mdash;|&#0*8212;|&#x0*2014;/i.test(page),
      "Public copy must not contain em dashes",
    );
  }
});

test("public documentation follows the no-em-dash writing rule", () => {
  for (const path of ["README.md", "AGENTS.md"]) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /\u2014|&mdash;|&#0*8212;|&#x0*2014;/i,
      `${path} must not contain em dashes`,
    );
  }
});
