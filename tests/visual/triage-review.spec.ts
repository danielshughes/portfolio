import { expect, test } from "@playwright/test";

const answer = {
  hypothesis: "Database waits may explain the slow tail.",
  checks: [
    "Inspect trace samples for database waits.",
    "Inspect the connection pool measurements.",
  ],
  unknown: "The cause of the increased wait is unknown.",
};
test("AI separates scenario facts, reviewed interpretation and model suggestions", async ({
  page,
}) => {
  await page.route("**/api/triage?*", (route) =>
    route.fulfill({ json: { scenario: "latency", answer } }),
  );
  await page.goto("/experiments/#triage");
  const card = page.locator("#triage");
  await expect(
    card.getByRole("heading", { name: "Scenario facts" }),
  ).toBeVisible();
  await expect(
    card.getByText("Reviewed interpretation", { exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(
    card.getByRole("heading", { name: "Model suggestion", exact: true }),
  ).toBeVisible();
  await expect(card.locator("[data-triage-answer] li")).toHaveCount(2);
  await expect(card.locator("[data-triage-status]")).not.toContainText(
    "evidence above",
  );
  await page.locator("#triage-scenario").selectOption("replicas");
  await expect(card.locator("[data-triage-evidence]")).toContainText(
    "HPA recommends",
  );
  await expect(card.locator("[data-triage-interpretation]")).toContainText(
    "scheduler",
  );
  await expect(card.locator("[data-triage-answer]")).toBeHidden();
});

test("public AI waits for human verification and sends only its token and scenario", async ({
  page,
}) => {
  let inference = 0;
  await page.route("**/api/triage-config", (route) =>
    route.fulfill({ json: { local: false, siteKey: "public-fixture" } }),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.turnstile={render(element,options){window.fixtureVerify=options.callback;return 'widget';},execute(){},remove(){}};`,
      }),
  );
  await page.route("**/api/triage?*", (route) => {
    inference++;
    expect(route.request().headers()["cf-turnstile-response"]).toBe(
      "fixture-human-token",
    );
    expect(route.request().postData()).toBe(null);
    return route.fulfill({ json: { scenario: "latency", answer } });
  });
  await page.goto("/experiments/#triage");
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { fixtureVerify?: unknown })
            .fixtureVerify,
      ),
    )
    .toBe("function");
  expect(inference).toBe(0);
  await page.evaluate(() =>
    (
      window as unknown as { fixtureVerify: (token: string) => void }
    ).fixtureVerify("fixture-human-token"),
  );
  await expect(page.locator("[data-triage-answer]")).toContainText(
    answer.hypothesis,
  );
  expect(inference).toBe(1);
});

test("verification fits a narrow viewport and a scenario change cancels its pending answer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 874 });
  let requests = 0;
  await page.route("**/api/triage-config", (route) =>
    route.fulfill({ json: { local: false, siteKey: "public-fixture" } }),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.turnstile={render(element,options){const widget=document.createElement('div');widget.textContent='Verification fixture';widget.style.width=options.size==='compact'?'150px':'300px';element.append(widget);window.fixtureVerify=options.callback;return 'widget';},execute(){},remove(){}};`,
      }),
  );
  await page.route("**/api/triage?*", (route) => {
    requests++;
    return route.fulfill({ json: { scenario: "latency", answer } });
  });
  await page.goto("/experiments/#triage");
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.getByText("Verification fixture")).toBeVisible();
  const widgetBounds = await page
    .getByText("Verification fixture")
    .boundingBox();
  const sourceBounds = await page.locator(".triage-source").boundingBox();
  expect(widgetBounds!.width).toBeLessThanOrEqual(sourceBounds!.width);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.locator("#triage-scenario").selectOption("replicas");
  await expect(page.getByText("Verification fixture")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Run triage", exact: true }),
  ).toBeEnabled();
  expect(requests).toBe(0);
});

test("AI occupies full width below the compact Cloudflare collection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/experiments/#triage");
  const bounds = await page.locator("#triage").boundingBox();
  const collection = await page.locator(".live-grid").boundingBox();
  expect(bounds!.width).toBeGreaterThan(collection!.width * 0.95);
  expect(bounds!.y).toBeGreaterThanOrEqual(collection!.y + collection!.height);
  await page.setViewportSize({ width: 402, height: 874 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(402);
});

test("changing scenario releases Run while verification code is still downloading", async ({
  page,
}) => {
  let scriptRequests = 0;
  let inference = 0;
  await page.route("**/api/triage-config", (route) =>
    route.fulfill({ json: { local: false, siteKey: "public-fixture" } }),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    () => {
      scriptRequests++;
    },
  );
  await page.route("**/api/triage?*", (route) => {
    inference++;
    return route.fulfill({ json: { scenario: "latency", answer } });
  });
  await page.goto("/experiments/#triage");
  const run = page.getByRole("button", { name: "Run triage", exact: true });
  await run.click();
  await expect.poll(() => scriptRequests).toBe(1);
  await page.locator("#triage-scenario").selectOption("replicas");
  await expect(run).toBeEnabled({ timeout: 1000 });
  await expect(page.locator("[data-triage-status]")).toHaveText(
    "Ready. No model request until you press Run.",
  );
  expect(inference).toBe(0);
  // The new caller can wait for the same script; cancellation must not restart it.
  await run.click();
  await expect(run).toBeDisabled();
  await page.locator("#triage-scenario").selectOption("telemetry");
  await expect(run).toBeEnabled({ timeout: 1000 });
  expect(scriptRequests).toBe(1);
});

test("AI opens with a useful reference, compact artwork and no Explore gate", async ({
  page,
}) => {
  for (const width of [1280, 620, 402, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/experiments/#triage");
    const card = page.locator("#triage");
    await expect(card.locator(".experiment-settings")).toHaveCount(0);
    await expect(card.locator("[data-triage-interpretation]")).toBeVisible();
    const preview = await card.locator(".experiment-visual").boundingBox();
    expect(preview!.height).toBeLessThanOrEqual(110);
    const run = await card.locator("[data-triage-run]").boundingBox();
    const status = await card.locator("[data-triage-status]").boundingBox();
    expect(status!.y - run!.y - run!.height).toBeLessThan(25);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
