import { expect, test, type Locator } from "@playwright/test";

async function pauseDuringStroke(mark: Locator) {
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(2);
  await mark.evaluate((root) => {
    for (const animation of root.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 200;
      animation.id = "authored-signature-run";
    }
  });
}

async function expectPartialStroke(mark: Locator) {
  const offset = await mark
    .locator("path")
    .evaluate((path) => parseFloat(getComputedStyle(path).strokeDashoffset));
  expect(offset).toBeGreaterThan(0);
  expect(offset).toBeLessThan(100);
  await expect(mark.locator("circle")).toHaveCSS("opacity", "0");
}

async function finishStroke(mark: Locator) {
  await mark
    .locator("path")
    .evaluate((path) => path.getAnimations()[0].finish());
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
}

test("signature finishes after pointer leave and does not restart while drawing", async ({
  page,
}) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.hover();
  await pauseDuringStroke(mark);
  await page.mouse.move(300, 300);
  await expectPartialStroke(mark);
  await mark.hover();
  expect(
    await mark.evaluate((root) =>
      root
        .getAnimations({ subtree: true })
        .every((animation) => animation.id === "authored-signature-run"),
    ),
  ).toBe(true);
  await expectPartialStroke(mark);
  await mark.evaluate((root) => {
    for (const animation of root.getAnimations({ subtree: true }))
      animation.play();
  });
  await page.mouse.move(300, 300);
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await mark.hover();
  await pauseDuringStroke(mark);
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

test("signature finishes after keyboard focus moves away", async ({ page }) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.focus();
  await pauseDuringStroke(mark);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Notes", exact: true })
    .focus();
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

test("reduced motion cancels a drawing safely and waits for a new interaction", async ({
  page,
}) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.hover();
  await pauseDuringStroke(mark);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(
    await mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.mouse.move(300, 300);
  await mark.hover();
  await pauseDuringStroke(mark);
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

test("signature stays complete with scripts disabled and reduced motion", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.hover();
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await context.close();
});
