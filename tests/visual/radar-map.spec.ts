import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { radar } from "./radar-fixture";

test("Radar loads automatically and replaces sample labels, dates and events", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/radar?*", (route) => {
    calls++;
    return route.fulfill({
      json: radar(new URL(route.request().url()).searchParams.get("country")!),
    });
  });
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-source")).toHaveText(
    "Cloudflare Radar · observed data",
  );
  await expect(map.locator(".internet-value")).toHaveText("50");
  await expect(
    map.getByRole("slider", { name: "Time in observed week" }),
  ).toHaveValue("0");
  await expect(map.locator(".internet-event-status")).toHaveText(
    "No reported disruption at this time.",
  );
  await expect(map.locator(".internet-connection")).toContainText(
    /Updated 10 Sept? 2026/,
  );
  await expect(map.locator(".internet-connection")).not.toContainText(
    "Confidence not supplied",
  );
  await expect(
    map.getByText("Illustrative disruption", { exact: false }),
  ).toHaveCount(0);
  await map.getByRole("button", { name: "Japan", exact: true }).click();
  await expect(map.locator(".internet-country-name")).toHaveText("Japan");
  await expect(map.locator(".internet-value")).toHaveText("50");
  await map.getByRole("slider").fill("110");
  await expect(map.locator(".internet-value")).toHaveText("N/A");
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(calls).toBeLessThanOrEqual(14);
});

for (const view of ["traffic", "bots"]) {
  test(`${view} omits absent confidence but retains ratings and quality warnings`, async ({
    page,
  }) => {
    let confidence: { level: number | null; annotationCount: number } = {
      level: null,
      annotationCount: 0,
    };
    await page.route("**/api/radar?*", (route) =>
      route.fulfill({
        json: {
          ...radar(),
          view,
          confidence,
          categories: [
            { label: "human", value: 70 },
            { label: "bot", value: 30 },
          ],
        },
      }),
    );
    for (const next of [
      { level: null, annotationCount: 0 },
      { level: null, annotationCount: 1 },
      { level: 3, annotationCount: 0 },
    ]) {
      confidence = next;
      await page.goto("/experiments/");
      const map = page.locator("#internet");
      if (view === "bots")
        await map.getByRole("tab", { name: "Bots", exact: true }).click();
      await expect(map.locator(".internet-source")).toHaveText(
        "Cloudflare Radar · observed data",
      );
      const metadata = map.locator(".internet-connection");
      await expect(metadata).not.toContainText("Confidence not supplied");
      if (next.annotationCount)
        await expect(metadata).toContainText(
          "Source quality annotations present",
        );
      else if (next.level !== null)
        await expect(metadata).toContainText("Confidence 3/5");
      else await expect(metadata).toHaveText(/^Updated .+ UTC\.$/);
    }
  });
}

test("Radar failure clears sample data and permits an explicit retry", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/radar?*", (route) =>
    route.fulfill(
      available
        ? { json: radar() }
        : { status: 503, json: { error: "radar_disabled" } },
    ),
  );
  await page.goto("/experiments/");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-value")).toHaveText("Unavailable");
  await expect(map.locator(".internet-source")).toHaveText(
    "Radar data unavailable",
  );
  await expect(map.locator(".internet-chart-line")).toHaveAttribute("d", "");
  await expect(map.getByRole("slider")).toBeDisabled();
  available = true;
  await map.getByRole("button", { name: "Retry Radar" }).click();
  await expect(map.locator(".internet-value")).toHaveText("50");
});

for (const theme of ["light", "dark"] as const) {
  test(`Observed map reflows and remains accessible in ${theme}`, async ({
    page,
  }) => {
    await page.route("**/api/radar?*", (route) =>
      route.fulfill({ json: radar() }),
    );
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/experiments/");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const map = page.locator("#internet");
    await expect(map.locator(".internet-source")).toHaveText(
      "Cloudflare Radar · observed data",
    );
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
    await map.screenshot({
      path: test.info().outputPath(`radar-${theme}.png`),
    });
  });
}
