import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

test("quality runs for pull requests and protected branches only", () => {
  assert.match(
    workflow,
    /on:\s*\n\s+pull_request:\s*\n\s+push:\s*\n\s+branches:\s*\n\s+- develop\s*\n\s+- main/,
  );
});
