import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  HEALTH_EXPECTED_SAMPLES,
  HEALTH_INTERVAL_MS,
  HEALTH_WINDOW_MS,
} from "../../src/experiments/health-model";

test("a full health window stays quiet and recent readings stay bounded", async ({
  page,
}) => {
  const start = Date.UTC(2026, 8, 10);
  const samples = Array.from(
    { length: HEALTH_EXPECTED_SAMPLES },
    (_, index) => ({
      observed_at: start + (index + 1) * HEALTH_INTERVAL_MS,
      status: index === 120 ? 503 : 200,
      elapsed_ms: index === 120 ? 60 : 10 + (index % 20),
      ok: index === 120 ? 0 : 1,
    }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        window: {
          start: new Date(start).toISOString(),
          end: new Date(start + HEALTH_WINDOW_MS).toISOString(),
        },
        samples,
      },
    }),
  );
  await page.goto("/experiments/#health");
  const card = page.locator("#health");
  await card.locator(".experiment-settings > summary").click();
  const control = card.getByRole("slider", {
    name: "Inspect a recorded check",
  });
  await expect(control).toHaveAttribute("max", String(samples.length - 1));
  await expect.soft(card.locator("[data-health-points] circle")).toHaveCount(0);
  await expect(card.locator("[data-health-failures] path")).toHaveCount(1);
  await expect(card.locator("[data-health-selected] circle")).toHaveCount(1);
  const path = await card.locator("[data-health-line]").getAttribute("d");
  expect(path?.match(/M/g)).toHaveLength(2);
  const recent = card.locator(".sample-table");
  await expect(recent).not.toHaveAttribute("open");
  await recent.locator("summary").click();
  await expect.soft(recent.locator("tbody tr")).toHaveCount(5);
  await expect(recent.locator("tbody tr").first()).toContainText("00:00");
  await expect(recent.locator("tbody tr").nth(4)).toContainText("23:40");
  await control.focus();
  await page.keyboard.press("Home");
  await expect(control).toHaveValue("0");
  await expect(control).toHaveAttribute("aria-valuetext", /00:05.*10 ms/);
  await page.keyboard.press("End");
  await expect(control).toHaveValue(String(samples.length - 1));
  await expect(control).toHaveAttribute("aria-valuetext", /00:00.*17 ms/);
  await page.setViewportSize({ width: 402, height: 874 });
  expect((await recent.boundingBox())!.height).toBeLessThan(300);
  const cardBounds = (await card.boundingBox())!;
  for (const selector of [".health-inspector", ".sample-table"]) {
    const bounds = (await card.locator(selector).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(cardBounds.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      cardBounds.x + cardBounds.width + 1,
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("health readings can be inspected with pointer, touch-sized control and keyboard", async ({
  page,
}) => {
  const start = Date.UTC(2026, 8, 10);
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        window: {
          start: new Date(start).toISOString(),
          end: new Date(start + 86400000).toISOString(),
        },
        samples: [
          { observed_at: start + 300000, status: 200, elapsed_ms: 25, ok: 1 },
          {
            observed_at: start + 43200000,
            status: 503,
            elapsed_ms: 4000,
            ok: 0,
          },
          { observed_at: start + 86400000, status: 200, elapsed_ms: 32, ok: 1 },
        ],
      },
    }),
  );
  await page.goto("/experiments/#health");
  const card = page.locator("#health");
  await card.locator(".experiment-settings > summary").click();
  const control = card.getByRole("slider", {
    name: "Inspect a recorded check",
  });
  await expect(control).toBeVisible();
  await expect(control).toHaveValue("2");
  await control.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(card.locator("[data-health-reading]")).toContainText("HTTP 503");
  await expect(card.locator("[data-health-reading]")).toContainText(
    "Failed check",
  );
  await expect(control).toHaveAttribute("aria-valuetext", /4,?000 ms/);
  await page.keyboard.press("Home");
  await expect(card.locator("[data-health-reading]")).toContainText("25 ms");
  const dot = card.locator("[data-health-points] circle").last();
  await dot.hover();
  await expect(card.locator("[data-health-reading]")).toContainText("32 ms");
  await expect(card.locator("[data-health-selected]")).toBeVisible();
  await page.setViewportSize({ width: 402, height: 874 });
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    (await new AxeBuilder({ page }).include("#health").analyze()).violations,
  ).toEqual([]);
});

test("stream output is meaningful before starting and remains compact", async ({
  page,
}) => {
  await page.goto("/experiments/#stream");
  const card = page.locator("#stream");
  await card.locator(".experiment-settings > summary").click();
  const output = card.locator("[data-stream-output]");
  await expect(output).toHaveText("No chunks received.");
  const bounds = await output.boundingBox();
  expect(bounds!.height).toBeLessThanOrEqual(52);
  await card.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(card.locator("[data-stream-status]")).toContainText(
    "Six chunks received",
  );
  await expect(output).toHaveText(
    "A response does not have to arrive all at once.",
  );
  await expect(card.locator("[data-stream-chunk][data-received]")).toHaveCount(
    6,
  );
});
