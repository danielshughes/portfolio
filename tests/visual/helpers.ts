import { expect, type Page } from "@playwright/test";

export async function openSignal(page: Page) {
  await page.goto("/experiments/");
  await page.locator("#wave .experiment-settings > summary").click();
  await expect(page.locator(".signal-field canvas")).toBeVisible();
}

export async function setTheme(page: Page, choice: string) {
  const toggle = page.getByRole("button", { name: /^Colour theme:/ });
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await toggle.getAttribute("data-choice")) === choice) break;
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-choice", choice);
}
