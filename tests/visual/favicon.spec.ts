import { expect, test } from "@playwright/test";

test("every primary route serves the same self-contained SVG favicon", async ({
  page,
}) => {
  for (const path of ["/", "/notes/", "/experiments/"]) {
    await page.goto(path);
    const icon = page.locator('head link[rel="icon"]');
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute("href", "/favicon.svg");
    await expect(icon).toHaveAttribute("type", "image/svg+xml");
    const response = await page.request.get((await icon.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    const asset = await response.text();
    const content = await page.evaluate((source) => {
      const svg = new DOMParser().parseFromString(source, "image/svg+xml");
      return {
        invalid: svg.querySelectorAll("parsererror").length,
        viewBox: svg.documentElement.getAttribute("viewBox"),
        paths: svg.querySelectorAll("path").length,
        externalOrDynamic: svg.querySelectorAll(
          "script, style, text, image, use, foreignObject, animate, [href], [style]",
        ).length,
      };
    }, asset);
    expect(content.invalid).toBe(0);
    expect(content.viewBox).toBe("0 0 64 64");
    // Keep only the two letter paths, with no decorative underline or accent.
    expect(content.paths).toBe(2);
    expect(content.externalOrDynamic).toBe(0);
  }
});

for (const theme of ["light", "dark"] as const) {
  for (const size of [16, 32, 64]) {
    test(`favicon renders at ${size}px on a ${theme} tab bar`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 96, height: 96 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/");
      await page.evaluate(
        ({ size, theme }) => {
          document.body.replaceChildren();
          Object.assign(document.body.style, {
            margin: "0",
            height: "100vh",
            display: "grid",
            placeItems: "center",
            backgroundImage: "none",
            backgroundColor: theme === "light" ? "#ffffff" : "#202020",
          });
          const icon = new Image(size, size);
          icon.alt = "Dan Hughes";
          icon.src = "/favicon.svg";
          document.body.append(icon);
        },
        { size, theme },
      );
      const icon = page.getByRole("img", { name: "Dan Hughes" });
      await icon.evaluate((element) => (element as HTMLImageElement).decode());
      await expect(icon).toBeVisible();
      const bounds = (await icon.boundingBox())!;
      expect(bounds.width).toBe(size);
      expect(bounds.height).toBe(size);
      await page.screenshot({
        path: testInfo.outputPath(`favicon-${size}-${theme}.png`),
      });
    });
  }
}
