import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openSignal, setTheme } from "./helpers";

test("noise changes the observed trace, not the reference", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSignal(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  const reference = () =>
    page
      .locator(".signal-field canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext("2d")!;
        const pixels = ctx.getImageData(
          0,
          0,
          canvas.width,
          Math.floor(canvas.height / 2),
        ).data;
        let hash = 0;
        for (const value of pixels) hash = (Math.imul(hash, 31) + value) | 0;
        return { width: canvas.width, height: canvas.height, hash };
      });
  await expect(page.locator(".signal-field")).toHaveAttribute(
    "data-motion",
    "paused",
  );
  const before = await reference();
  await page.getByRole("slider", { name: "Signal noise" }).fill("100");
  await expect(page.locator(".noise-level")).toHaveText("High interference");
  expect(await reference()).toEqual(before);
});

test("theme remains usable when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page.goto("/");
  await setTheme(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme follows the system, remembers an override and can return to system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await setTheme(page, "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/notes/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await setTheme(page, "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

for (const theme of ["light", "dark"])
  for (const route of ["/", "/notes/"]) {
    test(`${route} ${theme} complete section accessibility`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route);
      await setTheme(page, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }

test("signal comparison identifies the unchanged signal and the added noise", async ({
  page,
}) => {
  await openSignal(page);
  await expect(page.getByText("Known signal", { exact: true })).toBeVisible();
  await expect(page.getByText("Signal + noise", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Synthetic waves\. Add interference to the lower trace/),
  ).toBeVisible();
});

test("engineering examples identify contribution and visualise decisions", async ({
  page,
}) => {
  await page.goto("/notes/");
  await expect(page.locator(".contribution")).toHaveCount(4);
  await expect(page.locator(".decision-figure")).toHaveCount(4);
  await expect(page.locator("#observability")).toContainText("Python");
  await expect(page.locator("#ai-tooling")).toContainText(
    "shared MCP framework",
  );
});
