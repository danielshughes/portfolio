import { expect, test } from "@playwright/test";

const origins = ["http://127.0.0.1:4322"];
if (process.env.PORTFOLIO_DEV_URL) origins.push(process.env.PORTFOLIO_DEV_URL);
for (const origin of origins) {
  test(`waveform controls initialise on ${origin}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/experiments/`);
    const card = page.locator("#wave");
    await card.locator(".experiment-settings > summary").click();
    expect.soft(errors).toEqual([]);
    await expect(card.getByRole("slider")).toHaveCount(3);
    await expect(card.getByRole("slider", { name: "Frequency" })).toBeVisible();
    await card.getByRole("slider", { name: "Signal noise" }).fill("100");
    await expect(card.locator(".noise-level")).toHaveText("High interference");
    await card.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(
      card.getByRole("slider", { name: "Signal noise" }),
    ).toHaveValue("25");
  });
}
