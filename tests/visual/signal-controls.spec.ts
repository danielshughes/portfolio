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

for (const theme of ["light", "dark"] as const) {
  test(`simulation sliders share responsive controls in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/experiments/");
    for (const card of await page.locator("[data-experiment]").all()) {
      await card.locator(".experiment-settings > summary").click();
      await expect(card.locator(".experiment-controls")).toBeVisible();
    }
    for (const [width, textSize] of [
      [1440, 100],
      [620, 100],
      [402, 100],
      [320, 200],
    ]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}%`;
      }, textSize);
      const sliders = await page
        .locator('[data-experiment] input[type="range"]')
        .evaluateAll((inputs) =>
          inputs.map((input) => {
            const box = input.getBoundingClientRect();
            const label = input.closest("label")!.getBoundingClientRect();
            return {
              id: input.id,
              shared: !!input.closest(".experiment-controls"),
              width: box.width,
              height: box.height,
              minimum: Math.min(
                label.width / 2,
                13 *
                  parseFloat(
                    getComputedStyle(document.documentElement).fontSize,
                  ),
              ),
              rightGap: label.right - box.right,
            };
          }),
        );
      expect(sliders.length).toBeGreaterThan(3);
      for (const geometry of sliders) {
        expect(geometry.shared, geometry.id).toBe(true);
        expect(geometry.width, geometry.id).toBeGreaterThanOrEqual(
          geometry.minimum - 1,
        );
        expect(geometry.height, geometry.id).toBeGreaterThanOrEqual(44);
        expect(Math.abs(geometry.rightGap), geometry.id).toBeLessThanOrEqual(1);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const buttons = await page
        .locator("[data-experiment] .experiment-desk button:visible")
        .evaluateAll((elements) =>
          elements.map((button) => {
            const style = getComputedStyle(button);
            return {
              name: button.textContent,
              radius: style.borderRadius,
              font: style.fontFamily,
              height: button.getBoundingClientRect().height,
            };
          }),
        );
      for (const button of buttons) {
        expect(button.radius, button.name ?? "button").toBe("2px");
        expect(button.font).toMatch(/monospace/);
        expect(button.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
}
