import { expect, test } from "@playwright/test";
import { radar } from "./radar-fixture";

test("a delayed Radar module never paints a sample chart before initialisation", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_astro/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({ json: radar("GB") }),
  );
  await page.goto("/experiments/#internet", { waitUntil: "commit" });
  const map = page.locator("#internet");
  await expect(map).toBeVisible();
  await expect(map.locator(".internet-chart-line")).toHaveAttribute("d", "");
  await expect(map.locator(".internet-value")).toHaveText("Not loaded");
  const controls = await map.locator(".internet-countries").boundingBox();
  expect(controls?.height).toBeGreaterThan(40);
  release();
  await expect(map).not.toHaveAttribute("data-initialising", "");
  await expect(map.locator(".internet-value")).toHaveText("50");
  expect((await map.locator(".internet-countries").boundingBox())?.height).toBe(
    controls?.height,
  );
});

const summary = (country: string, view: string) => ({
  ...radar(country),
  view,
  categories: [
    { label: "human", value: 65 },
    { label: "bot", value: 35 },
  ],
});

for (const status of [429, 502, 503])
  test(`Radar ${status} stops document speculation but leaves explicit retry usable`, async ({
    page,
  }) => {
    const calls: string[] = [];
    let recovered = false;
    await page.route("**/api/radar?*", (route) => {
      const url = new URL(route.request().url());
      calls.push(url.search);
      return route.fulfill(
        recovered
          ? { json: radar(url.searchParams.get("country")!) }
          : {
              status,
              headers: { "retry-after": "60" },
              json: { error: "radar_unavailable" },
            },
      );
    });
    await page.goto("/experiments/#internet");
    const retry = page.getByRole("button", { name: "Retry Radar" });
    await expect(retry).toBeVisible();
    await page.locator(".internet-atlas").scrollIntoViewIfNeeded();
    await page.getByRole("tab", { name: "Bots", exact: true }).focus();
    // Observe a bounded quiet period after genuine focus intent. A positive
    // assertion alone can pass before the asynchronous queue starts.
    await page.waitForTimeout(250);
    expect(calls).toEqual(["?country=GB"]);
    recovered = true;
    await retry.click();
    await expect(page.locator(".internet-value")).toHaveText("50");
    await expect(retry).toBeHidden();
    expect(calls).toEqual(["?country=GB", "?country=GB"]);
  });

test("keyboard focus alone warms the intended Radar tab", async ({ page }) => {
  const calls: string[] = [];
  await page.route("**/api/radar?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    const country = url.searchParams.get("country")!,
      view = url.searchParams.get("view");
    return route.fulfill({
      json: view ? summary(country, view) : radar(country),
    });
  });
  await page.goto("/experiments/#internet");
  await expect(page.locator(".internet-value")).toHaveText("50");
  await page.locator(".internet-atlas").scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Bots", exact: true }).focus();
  await expect.poll(() => calls.includes("?country=GB&view=bots")).toBe(true);
  await expect(
    page.getByRole("tab", { name: "Traffic", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

for (const hint of [
  { saveData: true },
  { effectiveType: "2g" },
  { effectiveType: "3g" },
])
  test(`connection hint ${JSON.stringify(hint)} skips speculation but preserves automatic load and selection`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(
      (hint) =>
        Object.defineProperty(navigator, "connection", {
          value: Object.assign(new EventTarget(), hint),
        }),
      hint,
    );
    // Keep evidence at the browser/input boundary if a CI-only click is lost.
    // This records only authored fixture state, never response bodies or config.
    await page.addInitScript(() => {
      const events: object[] = [];
      Object.defineProperty(window, "radarInteractionEvents", {
        value: events,
      });
      for (const type of ["pointerdown", "pointerup", "click", "focusin"]) {
        document.addEventListener(type, (event) => {
          if (events.length >= 40) events.shift();
          const target = event.target instanceof Element ? event.target : null;
          const button = target?.closest<HTMLButtonElement>("[data-country]");
          const map = document.querySelector("#internet");
          events.push({
            type,
            country: button?.dataset.country ?? button?.dataset.mapCountry,
            target: target?.tagName,
            prevented: event.defaultPrevented,
            scrollY,
            point:
              event instanceof MouseEvent
                ? [event.clientX, event.clientY]
                : null,
            selected: map?.querySelector(".internet-country-code")?.textContent,
            busy: map?.getAttribute("aria-busy"),
          });
        });
      }
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const calls: string[] = [];
    await page.route("**/api/radar?*", (route) => {
      const url = new URL(route.request().url());
      calls.push(url.search);
      return route.fulfill({ json: radar(url.searchParams.get("country")!) });
    });
    try {
      await page.goto("/experiments/#internet");
      await expect(page.locator(".internet-value")).toHaveText("50");
      await page.getByRole("button", { name: "Japan", exact: true }).hover();
      await page.waitForTimeout(100);
      expect(calls).toEqual(["?country=GB"]);
      await page.getByRole("button", { name: "Japan", exact: true }).click();
      await expect(page.locator(".internet-country-name")).toHaveText("Japan");
      await expect(page.locator(".internet-value")).toHaveText("50");
      expect(calls).toEqual(["?country=GB", "?country=JP"]);
    } catch (error) {
      const browser = await page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-country="JP"]',
        );
        return {
          events: (window as Window & { radarInteractionEvents?: object[] })
            .radarInteractionEvents,
          scrollY,
          hash: location.hash,
          country: document.querySelector(".internet-country-code")
            ?.textContent,
          pressed: button?.getAttribute("aria-pressed"),
          button: button?.getBoundingClientRect().toJSON(),
          active: document.activeElement?.tagName,
        };
      });
      await testInfo.attach("radar-country-interaction", {
        contentType: "application/json",
        body: JSON.stringify({ hint, calls, pageErrors, browser }, null, 2),
      });
      throw error;
    }
  });

test("idle atlas does not speculate; intent caches tabs and hidden state cancels the queue", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route("**/api/radar?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    const country = url.searchParams.get("country")!,
      view = url.searchParams.get("view");
    return route.fulfill({
      json: view ? summary(country, view) : radar(country),
    });
  });
  await page.goto("/experiments/");
  await expect(page.locator(".internet-value")).toHaveText("50");
  await page.waitForTimeout(100);
  expect(calls).toEqual(["?country=GB"]);
  await page.locator(".internet-atlas").scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Bots", exact: true }).hover();
  await expect.poll(() => calls.includes("?country=GB&view=bots")).toBe(true);
  await page.getByRole("tab", { name: "Bots", exact: true }).click();
  await expect(page.locator(".radar-bars")).toContainText("65%");
  await page.getByRole("tab", { name: "Traffic", exact: true }).click();
  await page.getByRole("tab", { name: "Bots", exact: true }).click();
  await expect(page.locator(".radar-bars")).toContainText("65%");
  expect(calls.filter((call) => call === "?country=GB&view=bots")).toHaveLength(
    1,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenCalls = calls.length;
  await page.waitForTimeout(100);
  expect(calls.length).toBe(hiddenCalls);
  expect(calls.length).toBeLessThanOrEqual(14);
});

for (const width of [390, 1440])
  test(`pending values keep the chart geometry at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/radar?*", async (route) => {
      await pending;
      await route.fulfill({ json: radar() });
    });
    await page.goto("/experiments/#internet");
    await expect(page.locator(".internet-value")).toHaveText("Loading");
    const geometry = () =>
      page.locator(".internet-reading").evaluate((root) => {
        const chart = root
          .querySelector(".internet-history svg")!
          .getBoundingClientRect();
        return {
          top: chart.top - root.getBoundingClientRect().top,
          height: chart.height,
          width: chart.width,
        };
      });
    const before = await geometry();
    release();
    await expect(page.locator(".internet-value")).toHaveText("50");
    const after = await geometry();
    expect(Math.abs(before.top - after.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(1);
    expect(after.width).toBe(before.width);
  });

test("pending readings say Loading, cached country switches reuse validated data", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  await page.route("**/api/radar?*", async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    if (url.searchParams.get("country") === "GB") await pending;
    await route.fulfill({ json: radar(url.searchParams.get("country")!) });
  });
  await page.goto("/experiments/#internet");
  await expect(page.locator(".internet-value")).toHaveText("Loading");
  release();
  await expect(page.locator(".internet-value")).toHaveText("50");
  await page.getByRole("button", { name: "Japan", exact: true }).click();
  await expect(page.locator(".internet-value")).toHaveText("50");
  await page
    .getByRole("button", { name: "United Kingdom", exact: true })
    .click();
  await expect(page.locator(".internet-value")).toHaveText("50");
  expect(calls.filter((call) => call === "?country=GB")).toHaveLength(1);
});
