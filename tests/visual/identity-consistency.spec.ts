import { test, expect } from "@playwright/test";

test("homepage and browser title share the same positioning", async ({
  page,
}) => {
  await page.goto("/");
  const headline = "Observability, SRE & AI Leader";
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(headline);
  await expect(page).toHaveTitle(`Dan Hughes | ${headline}`);
});

test("all note links describe their practice and reach the matching article", async ({
  page,
}) => {
  const slugs = [
    "observability",
    "ai-tooling",
    "kubernetes-iac",
    "technical-leadership",
  ];
  await page.goto("/");
  expect(
    await page
      .locator(".project-grid > a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual(slugs.map((slug) => `/notes/#${slug}`));
  for (const slug of slugs) {
    await page.goto("/");
    await page.locator(`.project-grid > a[href="/notes/#${slug}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/notes/#${slug}$`));
    await expect(page.locator(`article#${slug}`)).toBeInViewport();
    await expect(page.locator(`article#${slug} h2`)).toBeVisible();
  }
  expect(
    await page
      .locator(".notes-nav a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual(slugs.map((slug) => `#${slug}`));
  await expect(
    page.locator(
      "article#freshness, article#agents, article#onboarding, article#people",
    ),
  ).toHaveCount(0);
});

test("background previews use visibility and motion preference without a page pause control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/experiments/");
  await expect(
    page.getByRole("button", { name: /background motion/i }),
  ).toHaveCount(0);
  const card = page.locator("#kubernetes");
  await expect(card).toHaveAttribute("data-preview-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card).toHaveAttribute("data-preview-motion", "paused");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(card).toHaveAttribute("data-preview-motion", "running");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(card).toHaveAttribute("data-preview-motion", "paused");
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(card).toHaveAttribute("data-preview-motion", "running");
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-preview-motion", "paused");
  await card.locator(".experiment-stage").scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-preview-motion", "running");
});
