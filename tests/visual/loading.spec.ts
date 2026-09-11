import { expect, test } from "@playwright/test";

test("a direct experiment link settles before its controls can be used", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/experiments/#room");
  const positions = await page.locator("#room").evaluate(async (room) => {
    const tops = [room.getBoundingClientRect().top];
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(requestAnimationFrame);
      tops.push(room.getBoundingClientRect().top);
    }
    return tops;
  });
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(
    1,
  );
  await expect(page.locator("#room")).toBeInViewport();
});

test("late fonts do not move already-readable content", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let releaseFonts!: () => void;
  const fonts = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route("**/*.woff2", async (route) => {
    await fonts;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Deliberately hold font responses beyond the short optional-font block period.
  await page.waitForTimeout(250);
  const positions = () =>
    page
      .locator(".site-header, h1, .hero-bottom, #work")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
  const before = await positions();
  releaseFonts();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  expect(await positions()).toEqual(before);
});

for (const route of ["/", "/notes/#ai-tooling"]) {
  test(`${route} loads and refreshes without an entrance animation`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const seen: string[] = [];
      Object.assign(window, { entranceAnimations: seen });
      document.addEventListener("animationstart", (event) => {
        // The requested caret blink is not a page/content entrance animation.
        if (
          event.animationName === "subtitle-blink" &&
          event.target instanceof Element &&
          event.target.matches(".subtitle-live .subtitle-caret")
        )
          return;
        seen.push(event.animationName);
      });
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        seen.push(this.tagName);
        return animate.apply(this, args);
      };
    });
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      else await page.goto(route);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      expect(
        await page.evaluate(
          () =>
            (window as Window & { entranceAnimations?: string[] })
              .entranceAnimations,
        ),
      ).toEqual([]);
      await expect(page.locator("h1")).toBeVisible();
    }
  });
}
