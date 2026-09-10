import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { radar } from "./radar-fixture";
test("automatic Radar loading has no manual refresh or completion clutter", async ({
  page,
}) => {
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({ json: radar() }),
  );
  await page.goto("/experiments/#internet");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-value")).toHaveText("50");
  await expect(
    map.getByRole("button", { name: /Refresh|Load Radar|Retry Radar/ }),
  ).toHaveCount(0);
  await expect(map.getByText("Data loaded", { exact: false })).toHaveCount(0);
  await expect(map.locator(".internet-connection")).toContainText("Updated");
  await page.reload();
  await expect(map.locator(".internet-value")).toHaveText("50");
});
test("reading guidance sits below the shared map and chart surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({ json: radar() }),
  );
  await page.goto("/experiments/#internet");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-value")).toHaveText("50");
  // Read all geometry in one frame: hash restoration can scroll between calls.
  const geometry = await map.evaluate((root) => {
    const box = (selector: string) =>
      root.querySelector(selector)!.getBoundingClientRect();
    const surface = box(".internet-surface"),
      guide = box(".radar-guide"),
      chart = box(".internet-history"),
      atlas = box(".internet-atlas"),
      countries = box(".internet-countries");
    return {
      guideBelow: guide.top >= surface.bottom,
      chartOverlapsMap: chart.top < atlas.bottom,
      chartBottom: chart.bottom,
      countriesBottom: countries.bottom,
    };
  });
  expect(geometry.guideBelow).toBe(true);
  expect(geometry.chartOverlapsMap).toBe(true);
  expect(geometry.chartBottom).toBeLessThanOrEqual(geometry.countriesBottom);
});
test("map pulse uses the shared motion control and stops offscreen", async ({
  page,
}) => {
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({ json: radar() }),
  );
  await page.goto("/experiments/#internet");
  const map = page.locator("#internet");
  const halo = map.locator(".internet-pin.is-selected .internet-pin-halo");
  await expect(
    map.getByRole("button", { name: "Pause map pulse", exact: true }),
  ).toHaveCount(0);
  await expect(halo).toHaveCSS("animation-iteration-count", "infinite");
  await expect(halo).toHaveCSS("animation-play-state", "running");
  await page
    .getByRole("button", { name: "Pause background motion", exact: true })
    .click();
  await map.locator(".internet-atlas").scrollIntoViewIfNeeded();
  await expect(halo).toHaveCSS("animation-play-state", "paused");
  await page
    .getByRole("button", { name: "Resume background motion", exact: true })
    .click();
  await map.locator(".internet-atlas").scrollIntoViewIfNeeded();
  await expect(halo).toHaveCSS("animation-play-state", "running");
  await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
  await expect(halo).toHaveCSS("animation-play-state", "paused");
});

test("Explore the source opens safely in another tab", async ({ page }) => {
  await page.goto("/experiments/");
  const link = page.getByRole("link", {
    name: "Explore the source ↗ (opens in a new tab)",
    exact: true,
  });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
const summary = (country: string, view: string) => ({
  mode: "radar",
  country,
  view,
  categories: [
    { label: "human", value: country === "JP" ? 80 : 65 },
    { label: "bot", value: country === "JP" ? 20 : 35 },
  ],
  window: { start: "2026-09-03T13:00:00Z", end: "2026-09-10T13:00:00Z" },
  updatedAt: "2026-09-10T14:30:00Z",
  confidence: { level: null, annotationCount: 0 },
});

test("Radar loads automatically and tabs keep their view across every country", async ({
  page,
}) => {
  const calls: string[] = [];
  await page.route("**/api/radar?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url.search);
    return route.fulfill({
      json: url.searchParams.has("view")
        ? summary(
            url.searchParams.get("country")!,
            url.searchParams.get("view")!,
          )
        : radar(url.searchParams.get("country")!),
    });
  });
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-value")).toHaveText("50");
  await map.getByRole("tab", { name: "Bots", exact: true }).click();
  await expect(
    map.getByText(
      "Likely automated is not the same as malicious. This is not a count of AI agents.",
    ),
  ).toBeVisible();
  await expect(map.locator(".radar-bars")).toContainText("65%");
  for (const name of [
    "United States",
    "Brazil",
    "Germany",
    "India",
    "Japan",
    "South Africa",
    "Australia",
    "United Kingdom",
  ]) {
    await map.getByRole("button", { name, exact: true }).click();
    await expect(map.locator(".internet-source")).toHaveText(
      "Cloudflare Radar · observed data",
    );
    await expect(
      map.getByRole("tab", { name: "Bots", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(map.locator(".radar-bars")).toContainText(
      name === "Japan" ? "80%" : "65%",
    );
  }
  // Every foreground selection is served once; background intent may add other views.
  for (const country of ["GB", "US", "BR", "DE", "IN", "JP", "ZA", "AU"])
    expect(
      calls.filter((call) => call === `?country=${country}&view=bots`),
    ).toHaveLength(1);
  expect(calls.length).toBeLessThanOrEqual(22);
  const beforeReload = calls.filter((call) => call === "?country=GB").length;
  await page.reload();
  await expect(page.locator(".internet-value")).toHaveText("50");
  expect(calls.filter((call) => call === "?country=GB")).toHaveLength(
    beforeReload + 1,
  );
});

test("tab keyboard navigation exposes one panel and reading guide", async ({
  page,
}) => {
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await map.getByRole("tab", { name: "Traffic", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    map.getByRole("tab", { name: "Bots", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    map.getByRole("tab", { name: "Protocols", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(map.getByRole("tabpanel")).toHaveCount(1);
  await expect(map.locator(".radar-guide")).toContainText("HTTP/3");
  expect(
    (
      await new AxeBuilder({ page })
        .include("#internet")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("a slow previous country cannot replace the current country's data", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/radar?*", async (route) => {
    const country = new URL(route.request().url()).searchParams.get("country")!;
    if (country === "GB") await pending;
    await route.fulfill({ json: summary(country, "bots") }).catch(() => {});
  });
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await map.getByRole("tab", { name: "Bots", exact: true }).click();
  await map.getByRole("button", { name: "Japan", exact: true }).click();
  await expect(map.locator(".radar-bars")).toContainText("80%");
  release();
  await expect(map.locator(".internet-country-name")).toHaveText("Japan");
  await expect(map.locator(".radar-bars")).toContainText("80%");
});

for (const theme of ["light", "dark"] as const)
  test(`summary tabs reflow with enlarged text in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.route("**/api/radar?*", (route) =>
      route.fulfill({ json: summary("GB", "bots") }),
    );
    await page.goto("/experiments/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const map = page.locator("#internet");
    await map.getByRole("tab", { name: "Bots", exact: true }).click();
    await expect(map.locator(".radar-bars")).toContainText("65%");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await map
        .locator(".internet-pin.is-selected .internet-pin-halo")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    expect(
      (
        await new AxeBuilder({ page })
          .include("#internet")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await map.screenshot({
      path: test.info().outputPath(`radar-tabs-${theme}.png`),
    });
  });
