import assert from "node:assert/strict";
import test from "node:test";

const wordsIn = (value: unknown): string[] => {
  if (typeof value === "string") {
    return value.trim().split(/\s+/u).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap(wordsIn);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(wordsIn);
  }

  return [];
};

test("content follows the approved portfolio contract", async () => {
  let portfolioContent;

  try {
    ({ portfolioContent } = await import("./portfolio.ts"));
  } catch {
    assert.fail("the approved portfolio content module must exist");
  }

  assert.equal(portfolioContent.headline, "Observability & SRE Leader");
  assert.ok(portfolioContent.support.trim().length > 0);
  assert.equal(portfolioContent.evidence.length, 3);
  assert.ok(portfolioContent.focus.length <= 6);

  const labels = portfolioContent.links.map(({ label }) => label);
  assert.equal(new Set(labels).size, labels.length);

  const visibleCopy = [
    portfolioContent.headline,
    portfolioContent.support,
    portfolioContent.signal,
    portfolioContent.evidence.flatMap(({ heading, need, contribution, outcome }) => [
      heading,
      need,
      contribution,
      outcome,
    ]),
    portfolioContent.focus,
    portfolioContent.contact,
    labels,
  ];
  const wordCount = wordsIn(visibleCopy).length;
  assert.ok(
    wordCount >= 300 && wordCount <= 450,
    `visible copy must contain 300-450 words; received ${wordCount}`,
  );
});
