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
    await expect(
      page.locator('a[href*="/playground"],a[href^="/work/"]'),
    ).toHaveCount(0);
  }
  for (const route of ["/playground/", "/work/"])
    expect((await request.get(route)).status()).toBe(404);
});
