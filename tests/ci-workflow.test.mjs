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

test("documentation-only changes skip the expensive quality and deploy jobs", () => {
  assert.match(workflow, /changes:\s*\n\s+runs-on: ubuntu-latest/);
  assert.match(
    workflow,
    /outputs:\s*\n\s+code:\s*\$\{\{ steps\.filter\.outputs\.code \}\}/,
  );
  assert.match(workflow, /id: filter/);
  assert.match(workflow, /if: needs\.changes\.outputs\.code == 'true'/);
  assert.match(workflow, /needs: changes/);
  assert.match(
    workflow,
    /deploy-development:\s*\n\s+if: github\.event_name == 'push'.*needs\.changes\.outputs\.code == 'true'/s,
  );
});
