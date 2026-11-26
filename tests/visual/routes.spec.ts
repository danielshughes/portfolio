import { test, expect } from "@playwright/test";

test("Experiments is the only experiment route, with no legacy forwarding", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Experiments", exact: true })
    .click();
  await expect(page).toHaveURL(/\/experiments\/$/);
  await expect(page).toHaveTitle("Experiments | Dan Hughes");
  await expect(
    page.getByRole("link", { name: "Experiments", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  for (const route of ["/", "/notes/", "/experiments/"]) {
    await page.goto(route);
    await expect(page.locator(".site-footer")).toContainText(
      "Always tinkering.",
    );
    await expect(
      page.locator('a[href*="/playground"],a[href^="/work/"]'),
    ).toHaveCount(0);
  }
  for (const route of ["/playground/", "/work/"])
    expect((await request.get(route)).status()).toBe(404);
});

test("unknown routes return a styled 404 page with a way back", async ({
  page,
}) => {
  const response = await page.goto("/does-not-exist/");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("Page not found | Dan Hughes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Nothing here.",
  );
  await page
    .getByRole("main")
    .getByRole("link", { name: "Experiments", exact: true })
    .click();
  await expect(page).toHaveURL(/\/experiments\/$/);
});
