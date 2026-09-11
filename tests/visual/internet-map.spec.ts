import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { radar } from "./radar-fixture";
// This suite intercepts Radar with authored fixtures. Preserve event/DOM evidence
// for intermittent browser failures without recording authenticated live traffic.
test.use({ trace: "retain-on-failure" });
test.beforeEach(async ({ page }) => {
  await page.route("**/api/radar?*", (route) => {
    const data = radar(
      new URL(route.request().url()).searchParams.get("country")!,
    );
    return route.fulfill({
      json: {
        ...data,
        outages: [
          {
            id: "fixture",
            start: data.timestamps[72],
            end: data.timestamps[78],
            description: "Authored test disruption",
            scope: "ASN",
          },
        ],
      },
    });
  });
});

test("the atlas has no coloured panel behind the map", async ({ page }) => {
  await page.goto("/experiments/");
  await expect(page.locator(".internet-map-panel")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});

test("Internet map keeps observed provenance visible and responds to country and time", async ({
  page,
}) => {
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await expect(
    map.getByText("Cloudflare Radar · observed data", { exact: true }),
  ).toBeVisible();
  await expect(map.getByText("Updated", { exact: false })).toBeVisible();
  await map.getByRole("button", { name: "Japan", exact: true }).click();
  await expect(
    map.getByRole("button", { name: "Japan", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(map.locator(".internet-country-name")).toHaveText("Japan");
  const frame = await map.locator(".internet-atlas").boundingBox();
  await expect(map.getByRole("slider")).toBeEnabled();
  await map.getByRole("slider", { name: "Time in observed week" }).fill("73");
  await expect(map.locator(".internet-event-status")).toContainText(
    "Authored test disruption",
  );
  expect((await map.locator(".internet-atlas").boundingBox())!.height).toBe(
    frame!.height,
  );
  await map.getByRole("button", { name: "View disruption 1" }).click();
  await expect(
    map.getByRole("slider", { name: "Time in observed week" }),
  ).toHaveValue("72");
});

test("Internet map replay is optional and settles under reduced motion", async ({
  page,
}) => {
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await map.getByRole("button", { name: "Play week", exact: true }).click();
  await expect(
    map.getByRole("button", { name: "Pause week", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    map.getByRole("button", { name: "Reduced motion on", exact: true }),
  ).toBeDisabled();
  const before = await map.getByRole("slider").inputValue();
  await page.waitForTimeout(250);
  await expect(map.getByRole("slider")).toHaveValue(before);
  await map.getByRole("button", { name: "Brazil", exact: true }).click();
  await expect(map.locator(".internet-country-name")).toHaveText("Brazil");
});

test("active replay checks reduced motion even without a media change event", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = nativeMatchMedia(query);
      if (query === "(prefers-reduced-motion: reduce)")
        media.addEventListener = () => {};
      return media;
    };
  });
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await map.getByRole("button", { name: "Play week", exact: true }).click();
  await expect(map).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    map.getByRole("button", { name: "Reduced motion on", exact: true }),
  ).toBeDisabled();
  await expect(map).toHaveAttribute("data-motion", "paused");
});

for (const theme of ["light", "dark"] as const) {
  test(`Internet map is accessible with enlarged text in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/experiments/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.locator("#internet").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .include("#internet")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.locator("#internet").screenshot({
      path: test.info().outputPath(`internet-${theme}-enlarged.png`),
    });
  });
}

test("Internet map supports keyboard selection and stops replay offscreen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  const country = map.getByRole("button", { name: "Japan", exact: true });
  await country.focus();
  await page.keyboard.press("Enter");
  await expect(map.locator(".internet-country-name")).toHaveText("Japan");
  await expect(map).toHaveAttribute("aria-busy", "false");
  await expect(map.getByRole("slider")).toBeEnabled();
  await map.getByRole("button", { name: "View disruption 1" }).click();
  await expect(map.getByRole("slider")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(map.getByRole("slider")).toHaveValue("73");
  await map.screenshot({
    path: test.info().outputPath("internet-desktop.png"),
  });
  await map.getByRole("button", { name: "Play week", exact: true }).click();
  await expect(map).toHaveAttribute("data-motion", "running");
  await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
  await expect(map).toHaveAttribute("data-motion", "paused");
});

test("Internet map makes no external calls and has an honest no-script view", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:"))
      external.push(request.url());
  });
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-atlas")).toBeVisible();
  await expect(
    map.getByText("Cloudflare Radar", { exact: true }).first(),
  ).toBeVisible();
  await expect(map.locator(".internet-chart-line")).toHaveAttribute("d", "");
  // Text selectors skip noscript nodes, even in a script-disabled context.
  await expect(map.locator(".internet-noscript")).toBeVisible();
  await expect(map.locator(".internet-noscript")).toHaveText(
    "Enable JavaScript to load Cloudflare Radar.",
  );
  await expect(map.getByRole("slider")).toHaveCount(0);
  expect(external).toEqual([]);
  await context.close();
});
