import { expect, type Page } from "@playwright/test";

export async function openSignal(page: Page) {
  await page.goto("/experiments/");
  await page.locator("#wave .experiment-settings > summary").click();
  await expect(page.locator(".signal-field canvas")).toBeVisible();
  // CSS visibility can precede ResizeObserver sizing the backing bitmap.
  // Pixel comparisons must wait for a real drawing, not a blank initial canvas.
  await expect
    .poll(() =>
      page
        .locator(".signal-field canvas")
        .evaluate((canvas: HTMLCanvasElement) => {
          if (!canvas.width || !canvas.height) return false;
          return canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height)
            .data.some((value, index) => index % 4 === 3 && value !== 0);
        }),
    )
    .toBe(true);
}

export async function setTheme(page: Page, choice: string) {
  const toggle = page.getByRole("button", { name: /^Colour theme:/ });
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await toggle.getAttribute("data-choice")) === choice) break;
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("data-choice", choice);
}
