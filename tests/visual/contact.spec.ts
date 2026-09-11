import { test, expect } from "@playwright/test";

for (const route of ["/", "/notes/"])
  test(`${route} contact links open a separate tab without replacing the portfolio`, async ({
    page,
    context,
  }) => {
    // Stub only the destination, avoiding dependence on LinkedIn availability.
    await context.route("https://www.linkedin.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Contact destination</title>",
      }),
    );
    await page.goto(route);
    await expect(page.locator("#contact a")).toHaveCount(route === "/" ? 2 : 1);
    for (const link of await page
      .locator('#contact a[href*="linkedin.com"]')
      .all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
      await expect(link).toHaveAccessibleDescription("Opens in a new tab.");
      const popupPromise = page.waitForEvent("popup");
      await link.click();
      const popup = await popupPromise;
      await expect(popup).toHaveURL(
        "https://www.linkedin.com/in/dan-hughes-796098108/",
      );
      await expect(page).toHaveURL("http://127.0.0.1:4322" + route);
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await popup.close();
    }
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Contact" }),
    ).not.toHaveAttribute("target", "_blank");
  });
