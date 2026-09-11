import { expect, test } from "@playwright/test";
import { radar } from "./radar-fixture";

test.use({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  hasTouch: true,
});

test("mobile summary metadata sits close to the divider without moving the tab bar", async ({
  page,
}) => {
  const calls: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const events: object[] = [];
    Object.assign(window, { radarTabEvents: events });
    for (const type of ["pointerdown", "pointerup", "click"])
      document.addEventListener(type, (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (events.length >= 12) events.shift();
        events.push({
          type,
          tag: target?.tagName,
          tab: target?.closest<HTMLElement>("[data-radar-view]")?.dataset
            .radarView,
          scrollY,
        });
      });
  });
  await page.route("**/api/radar?*", (route) => {
    calls.push(new URL(route.request().url()).search);
    const view = new URL(route.request().url()).searchParams.get("view");
    return route.fulfill({
      json: view
        ? {
            ...radar(),
            view,
            categories: [
              { label: "desktop", value: 60 },
              { label: "mobile", value: 40 },
            ],
          }
        : radar(),
    });
  });
  await page.goto("/experiments/#internet");
  await page.getByRole("tab", { name: "Devices", exact: true }).click();
  try {
    await expect(page.locator(".radar-bars li")).toHaveCount(2);
  } catch (error) {
    // Authored fixtures and bounded DOM state only, never provider responses.
    const state = await page.evaluate(() => ({
      events: (window as Window & { radarTabEvents?: object[] }).radarTabEvents,
      selected: document
        .querySelector('[data-radar-view][aria-selected="true"]')
        ?.getAttribute("data-radar-view"),
      source: document.querySelector(".internet-source")?.textContent,
      summary: document.querySelector(".radar-summary-window")?.textContent,
      busy: document.querySelector("#internet")?.getAttribute("aria-busy"),
    }));
    console.error(JSON.stringify({ calls, pageErrors, state }));
    throw error;
  }
  const gap = await page.evaluate(
    () =>
      document.querySelector(".internet-surface")!.getBoundingClientRect()
        .bottom -
      document.querySelector(".radar-summary-window")!.getBoundingClientRect()
        .bottom,
  );
  expect(gap).toBeLessThan(26);
});

test("homepage note links do not acquire entrance transforms during the first scroll", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    const notes: string[] = [];
    Object.assign(window, { noteEntrances: notes });
    Element.prototype.animate = function (...args) {
      if (this.matches(".project")) notes.push(this.className);
      return animate.apply(this, args);
    };
  });
  await page.goto("/");
  for (const link of await page.locator(".project").all()) {
    await page.keyboard.press("PageDown");
    await link.scrollIntoViewIfNeeded();
  }
  expect(
    await page.evaluate(
      () => (window as Window & { noteEntrances?: string[] }).noteEntrances,
    ),
  ).toEqual([]);
  await page.reload();
  await page.keyboard.press("PageDown");
  await page.locator(".project").first().scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => (window as Window & { noteEntrances?: string[] }).noteEntrances,
    ),
  ).toEqual([]);
});

test("Say hello uses an authored arrow instead of an emoji-prone glyph", async ({
  page,
}) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "Say hello", exact: true });
  await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(link).not.toContainText("↗");
});

test("signature continues at an even pace with a separate soft endpoint arrival", async ({
  page,
}) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.focus();
  const timing = await mark.evaluate((root) => {
    const path = root.querySelector("path")!;
    const trace = path.getAnimations()[0];
    const endpoint = root.querySelector("circle")!.getAnimations()[0];
    return {
      normalised: path.hasAttribute("pathLength"),
      trace: trace.effect!.getTiming(),
      endpoint: endpoint.effect!.getTiming(),
      frames: (endpoint.effect as KeyframeEffect).getKeyframes(),
    };
  });
  expect(timing.normalised).toBe(false);
  expect(timing.trace.easing).toBe("linear");
  expect(Number(timing.endpoint.duration)).toBeGreaterThan(
    Number(timing.trace.duration),
  );
  expect(timing.endpoint.easing).not.toContain("steps");
});
