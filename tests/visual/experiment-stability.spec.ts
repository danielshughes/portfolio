import { expect, test } from "@playwright/test";

for (const [width, textSize] of [
  [390, "100%"],
  [1440, "100%"],
  [320, "200%"],
] as const) {
  for (const id of [
    "kubernetes",
    "mcp",
    "wave",
    "latency",
    "requests",
    "world",
  ]) {
    test(`${id} keeps its frame and Explore target steady at ${width}px with ${textSize} text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/experiments/");
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, textSize);
      await page.evaluate(() => document.fonts.ready);
      const card = page.locator(`#${id}`);
      const summary = card.locator(".experiment-settings > summary");
      await summary.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const target = (await summary.boundingBox())!;
      const frame = (await card.locator(".experiment-stage").boundingBox())!;
      await page.mouse.click(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await expect(card).toHaveClass(/experiment-ready/);
      const expanded = (await card.locator(".experiment-stage").boundingBox())!;
      expect.soft(expanded.width).toBeCloseTo(frame.width, 1);
      expect.soft(expanded.height).toBeCloseTo(frame.height, 1);
      const openTarget = (await summary.boundingBox())!;
      // Scroll anchoring rounds to whole CSS pixels in Firefox. A one-pixel
      // offset preserves the target; the second click below tests that too.
      expect.soft(Math.abs(openTarget.y - target.y)).toBeLessThanOrEqual(1);
      expect.soft(openTarget.height).toBeCloseTo(target.height, 1);
      expect
        .soft(
          await card
            .locator(".interactive-stage")
            .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        )
        .toBe(true);
      await page.mouse.click(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await expect(card.locator(".experiment-settings")).not.toHaveAttribute(
        "open",
        "",
      );
      expect(
        (await card.locator(".experiment-stage").boundingBox())!.height,
      ).toBeCloseTo(frame.height, 1);
    });
  }
}
