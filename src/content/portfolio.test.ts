import assert from "node:assert/strict";
import test from "node:test";
import { portfolioContent } from "./portfolio.ts";
test("public destinations use HTTPS without credentials", () => {
  for (const link of [portfolioContent.github, portfolioContent.linkedin]) {
    const url = new URL(link);
    assert.equal(url.protocol, "https:");
    assert.equal(url.username + url.password, "");
  }
});
