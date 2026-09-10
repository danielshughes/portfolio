import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("signature endpoint waits for the trace to finish", async ({ page }) => {
  await page.goto("/");
  await page.locator(".site-mark").hover();
  const circle = page.locator(".signature-trace circle");
  await expect
    .poll(() => circle.evaluate((el) => el.getAnimations().length))
    .toBe(1);
  await circle.evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 300;
  });
  await expect(circle).toHaveCSS("opacity", "0");
  await circle.evaluate((el) => el.getAnimations()[0].finish());
  await expect(circle).toHaveCSS("opacity", "1");
});

test("navigation uses single words and Kubernetes is visible in the main story", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link"),
  ).toHaveText(["Notes", "Experiments", "Contact ↗"]);
  await expect(page.locator(".opening-copy")).toContainText("Kubernetes");
  await expect(page.locator(".project-infra h3")).toContainText("Kubernetes");
});

test("home has its own graphic and offers experiments without a sparkle logo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".connection-field svg")).toBeVisible();
  await expect(page.locator(".site-mark")).not.toContainText("✳");
  await expect(page.locator(".site-mark svg")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Experiments", exact: true })
    .click();
  await expect(page).toHaveURL(/\/experiments\/$/);
  await expect(
    page.getByRole("link", { name: "Experiments", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("experiments have meaningful controls, deterministic reset and suspended animation", async ({
  page,
}) => {
  await page.goto("/experiments/");
  const latency = page.locator("#latency");
  await latency.locator(".experiment-settings > summary").click();
  await expect(latency.getByLabel("Slow requests")).toBeVisible();
  const initial = await latency.locator("output").textContent();
  await latency.getByLabel("Slow requests").fill("1000");
  await expect(latency.locator("output")).not.toHaveText(initial!);
  await latency.getByRole("button", { name: "Reset" }).click();
  await expect(latency.locator("output")).toHaveText(initial!);
  const requests = page.locator("#requests");
  await requests.locator(".experiment-settings > summary").click();
  await requests.getByLabel("Concurrency").fill("1");
  await expect(requests.locator("output")).toContainText("5 of 12");
  const world = page.locator("#world");
  await world.locator(".experiment-settings > summary").click();
  await expect(world.locator("canvas")).toBeVisible();
  await world.getByRole("button", { name: "Store", exact: true }).click();
  await expect(world.locator("output")).toContainText("API, Worker");
  await world.getByRole("button", { name: "Pause rotation" }).click();
  await expect(world).toHaveAttribute("data-motion", "paused");
  await world.getByRole("button", { name: "Reset" }).click();
  await world.locator(".experiment-settings > summary").click();
  await expect(world).toHaveAttribute("data-motion", "paused");
});

for (const theme of ["light", "dark"] as const) {
  test(`playground reflows and remains accessible in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/experiments/");
    for (const id of ["latency", "requests", "world"])
      await page.locator(`#${id} .experiment-settings > summary`).click();
    await expect(page.locator("#world")).toHaveAttribute(
      "data-motion",
      "paused",
    );
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("playground has readable diagrams without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/experiments/");
  await page.locator("#world .experiment-settings > summary").click();
  await page.getByText("Read the connections", { exact: true }).click();
  await expect(
    page.getByText("Store: API, Worker", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#world .experiment-controls")).toBeHidden();
  await context.close();
});

test("optional renderers load on opening, dragging rotates, and offscreen work stops", async ({
  page,
}) => {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/");
  expect(scripts.some((url) => /\/(world|charts)\./.test(url))).toBe(false);
  await page.goto("/experiments/");
  expect(scripts.some((url) => /\/(world|charts)\./.test(url))).toBe(false);
  const world = page.locator("#world");
  await world.locator(".experiment-settings > summary").click();
  await expect(world.locator("canvas")).toBeVisible();
  expect(scripts.some((url) => /\/world\./.test(url))).toBe(true);
  expect(scripts.some((url) => /\/charts\./.test(url))).toBe(false);
  await world.getByRole("button", { name: "Pause rotation" }).click();
  const before = await world
    .getByLabel("Rotation", { exact: true })
    .inputValue();
  const box = (await world.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
  await page.mouse.up();
  expect(
    await world.getByLabel("Rotation", { exact: true }).inputValue(),
  ).not.toBe(before);
  await expect(world).toHaveAttribute("data-motion", "paused");
  await world.getByRole("button", { name: "Resume rotation" }).click();
  await expect(world).toHaveAttribute("data-motion", "running");
  await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
  await expect(world).toHaveAttribute("data-motion", "paused");
});

test("smallest viewport preserves the name, icons and expanded content at double text size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".intro-name")).toBeVisible();
  await page.goto("/experiments/");
  for (const id of ["latency", "requests", "world"])
    await page.locator(`#${id} .experiment-settings > summary`).click();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
