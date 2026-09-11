import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openSignal } from "./helpers";

test("notes and the signal experiment are usable", async ({ page }) => {
  await openSignal(page);
  await expect(
    page.getByRole("slider", { name: "Signal noise" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(
    page.getByRole("button", { name: "Resume animation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Notes", exact: true }).first().click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(
    page.getByRole("heading", {
      name: "Observability that holds up in operations.",
    }),
  ).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`notes readable and accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/notes/");
    await expect(page.locator("article")).toHaveCount(4);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test(`readable and accessible at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".ai-section")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeInViewport();
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("scroll motion responds to a live reduced-motion preference", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.addEventListener(
      "pageshow",
      () => {
        Object.assign(window, { motionPageShown: true });
      },
      { once: true },
    );
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.waitForFunction(
    () => (window as Window & { motionPageShown?: boolean }).motionPageShown,
  );
  const section = page.locator(".off-clock[data-reveal]");
  // Establish the initial off-screen observation before crossing the reveal
  // threshold. Navigation's load event alone does not settle observers.
  await section.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const observer = new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(element);
      }),
  );
  // Mark exploration with real input, then place the target deterministically.
  // A tiny wheel delta can produce no input event in WebKit.
  // Note previews deliberately have no entrance animation. Inspect this
  // section's own animation, not an unrelated caret or hover elsewhere.
  await page.keyboard.press("PageDown");
  await section.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await expect
    .poll(() => section.evaluate((element) => element.getAnimations().length))
    .toBeGreaterThan(0);
  const animation = await section.evaluateHandle(
    (element) => element.getAnimations()[0],
  );
  await expect(section).toBeInViewport();
  await page.emulateMedia({ reducedMotion: "reduce" });
  // Cancellation returns an animation to idle. Natural completion must not
  // satisfy the reduced-motion check merely because the duration elapsed.
  await expect
    .poll(() => animation.evaluate((value) => value?.playState))
    .toBe("idle");
  await expect
    .poll(() => section.evaluate((element) => element.getAnimations().length))
    .toBe(0);
  await expect(section).toBeVisible();
  await expect(section).toHaveCSS("opacity", "1");
  await expect(section).toHaveCSS("transform", "none");
  await animation.dispose();
});

test("essential content works without JavaScript", async ({ browser }) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto("http://127.0.0.1:4322/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Observability",
  );
  await expect(page.locator(".ai-section")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect on LinkedIn" }),
  ).toBeVisible();
  await expect(page.locator(".connection-field svg")).toBeVisible();
  await expect(page.locator(".connection-trigger")).toBeHidden();
  await page.getByRole("link", { name: "Notes", exact: true }).first().click();
  await expect(page.locator("article")).toHaveCount(4);
  await page.close();
});

test("signal controls alter the graphic and stop offscreen work", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openSignal(page);
  const field = page.locator(".signal-field");
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(field).toHaveAttribute("data-motion", "paused");
  const before = await page
    .locator(".signal-field canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole("slider", { name: "Signal noise" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("slider", { name: "Signal noise" })).toHaveValue(
    "100",
  );
  expect(
    await page
      .locator(".signal-field canvas")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).not.toBe(before);
  await page.getByRole("button", { name: "Resume animation" }).click();
  await page.locator("#play-title").scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "paused");
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field).toHaveAttribute("data-motion", "paused");
  await expect(
    page.locator("#wave").getByRole("button", { name: "Reduced motion on" }),
  ).toBeDisabled();
});
