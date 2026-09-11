import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const colourScheme of ["light", "dark"] as const) {
  test(`both galleries balance neutral and tinted cards in ${colourScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: colourScheme });
    await page.goto("/experiments/");
    const plain = await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    for (const collection of await page
      .locator(".experiment-collection")
      .all()) {
      const colours = await collection
        .locator(".experiment-stage")
        .evaluateAll((stages) =>
          stages.map((stage) => ({
            background: getComputedStyle(stage).backgroundColor,
            accent: getComputedStyle(stage)
              .getPropertyValue("--preview-ink")
              .trim(),
          })),
        );
      expect(colours.some((colour) => colour.background === plain)).toBe(true);
      expect(colours.some((colour) => colour.background !== plain)).toBe(true);
      for (const [i, colour] of colours.entries()) {
        expect(colour.accent).not.toBe("");
        if (colour.background === plain) continue;
        if (i > 0)
          expect(colour.background).not.toBe(colours[i - 1].background);
        if (i > 1)
          expect(colour.background).not.toBe(colours[i - 2].background);
      }
    }
  });
}

for (const id of ["kubernetes", "mcp", "latency", "requests"]) {
  test(`${id} animation can pause, finish and replay without changing its result`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.clock.install();
    await page.goto("/experiments/");
    const card = page.locator("#" + id);
    await card.locator(".experiment-settings > summary").click();
    await card.locator(".experiment-stage").scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute("data-motion", "running");
    const result = await card.locator("output").textContent();
    await card.getByRole("button", { name: "Pause", exact: true }).click();
    const drawing = await card.locator(".interactive-stage svg").innerHTML();
    await page.clock.runFor(1000);
    expect(await card.locator(".interactive-stage svg").innerHTML()).toBe(
      drawing,
    );
    await card.getByRole("button", { name: "Resume", exact: true }).click();
    await page.clock.runFor(8000);
    await expect(
      card.getByRole("button", { name: "Replay", exact: true }),
    ).toBeVisible();
    await expect(card.locator("output")).toHaveText(result!);
    await card.getByRole("button", { name: "Replay", exact: true }).click();
    await expect(card).toHaveAttribute("data-motion", "running");
    await card.locator(".experiment-settings > summary").click();
    await expect(card).toHaveAttribute("data-motion", "paused");
  });
}

test("opening the model keeps the same accent as its preview", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experiments/");
  const card = page.locator("#mcp");
  const previewColour = await card
    .locator(".preview-bead")
    .evaluate((el) => getComputedStyle(el).fill);
  await card.locator(".experiment-settings > summary").click();
  await expect(card.locator(".system-chart .budget").first()).toBeVisible();
  await expect(card.locator(".system-chart .budget").first()).toHaveCSS(
    "fill",
    previewColour,
  );
});

test("all experiments have visible previews in a staggered gallery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/experiments/");
  await expect(page.locator("[data-experiment]")).toHaveCount(6);
  await expect(page.locator(".live-grid [data-live]")).toHaveCount(4);
  await expect(page.locator("[data-live]")).toHaveCount(5);
  for (const card of await page
    .locator("[data-experiment], [data-live]")
    .all()) {
    await expect(card.locator(".experiment-stage")).toHaveCount(1);
    await expect(card.locator(".experiment-preview")).toBeVisible();
  }
  const a = (await page.locator("#kubernetes").boundingBox())!,
    b = (await page.locator("#mcp").boundingBox())!;
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(b.y).toBeGreaterThan(a.y);
  await expect(page.locator("#kubernetes .experiment-preview")).toBeVisible();
  await expect(page.locator("#kubernetes")).toHaveAttribute(
    "data-preview-motion",
    "running",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#kubernetes")).toHaveAttribute(
    "data-preview-motion",
    "paused",
  );
});
test("Kubernetes shows pending pods and adding capacity allows placement", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experiments/");
  const card = page.locator("#kubernetes");
  await card.locator(".experiment-settings > summary").click();
  await card.getByLabel("CPU demand").fill("4000");
  await card.getByLabel("Nodes", { exact: true }).fill("1");
  await expect(card.locator("output")).toContainText("8 pending");
  await expect(card.locator(".step-text")).toHaveText("8 pods still pending");
  await expect(card.locator("output")).toContainText("1 node,");
  await card.getByLabel("Nodes", { exact: true }).fill("3");
  await expect(card.locator("output")).toContainText("0 pending");
  await card.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(card.getByLabel("CPU demand")).toHaveValue("1200");
});
test("MCP host approval and tool budget are actual simulation boundaries", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experiments/");
  const card = page.locator("#mcp");
  await card.locator(".experiment-settings > summary").click();
  await card.getByLabel("Approval").check();
  await expect(card.locator("output")).toContainText("approval");
  await card.getByRole("button", { name: "Deny simulated write" }).click();
  await expect(card.locator("output")).toContainText("denied");
  await expect(card.locator("output")).toBeFocused();
  await card.getByLabel("Tool-call budget").fill("0");
  await expect(card.locator("output")).toContainText("budget");
});

test("agent decisions do not wait for an offscreen animation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/experiments/");
  const card = page.locator("#mcp");
  await card.locator(".experiment-settings > summary").click();
  await card.getByLabel("Approval").check();
  await expect(
    card.getByRole("button", { name: "Deny simulated write" }),
  ).toBeVisible({ timeout: 1000 });
  await card.getByRole("button", { name: "Deny simulated write" }).click();
  await expect(card.locator("output")).toContainText("denied", {
    timeout: 1000,
  });
});
for (const theme of ["light", "dark"] as const)
  test(`expanded gallery is accessible and reflows in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/experiments/");
    for (const summary of await page
      .locator(".experiment-settings > summary")
      .all())
      await summary.click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
