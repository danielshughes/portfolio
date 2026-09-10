import { expect, test } from "@playwright/test";

const previews = [
  [".project-observe", ".health-preview strong"],
  [".project-ai", ".agent-path b"],
  [".project-infra", ".pipeline-line"],
  [".project-people", ".type-art"],
] as const;

for (const [cardSelector, graphicSelector] of previews) {
  test(`${cardSelector} responds equally to hover and keyboard focus`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const card = page.locator(cardSelector);
    const graphic = card.locator(graphicSelector).first();
    await card.scrollIntoViewIfNeeded();
    const transform = () =>
      graphic.evaluate((element) => getComputedStyle(element).transform);
    const resting = await transform();
    await card.hover();
    await expect.poll(transform).not.toBe(resting);
    await graphic.evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });
    const hovered = await transform();
    await page.mouse.move(0, 0);
    await expect.poll(transform).toBe(resting);
    await page.keyboard.press("Tab");
    await card.focus();
    await expect(card).toBeFocused();
    await expect.poll(transform).toBe(hovered);
    await expect(card.locator("h3")).toHaveCSS(
      "text-decoration-line",
      "underline",
    );
    expect(
      await graphic.evaluate((element) =>
        element
          .getAnimations()
          .some(
            (animation) =>
              animation.effect?.getTiming().iterations === Infinity,
          ),
      ),
    ).toBe(false);
  });
}

test("reduced motion keeps every preview graphic still on hover and focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const [cardSelector, graphicSelector] of previews) {
    const card = page.locator(cardSelector),
      graphic = card.locator(graphicSelector).first();
    const resting = await graphic.evaluate(
      (element) => getComputedStyle(element).transform,
    );
    await card.hover();
    await page.keyboard.press("Tab");
    await card.focus();
    expect(
      await graphic.evaluate((element) => getComputedStyle(element).transform),
    ).toBe(resting);
    await expect(card.locator("h3")).toHaveCSS(
      "text-decoration-line",
      "underline",
    );
  }
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test("touch opens a note on its first tap without relying on hover", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4322/");
  await page.locator(".project-observe").tap();
  await expect(page).toHaveURL(/\/notes\/#freshness$/);
  await context.close();
});
