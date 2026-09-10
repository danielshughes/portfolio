import { expect, test } from "@playwright/test";
import { openSignal } from "./helpers";

test("notes index numbers stay together at every layout and text size", async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/");
    for (const size of ["100%", "200%"]) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, size);
      const split = await page
        .locator(".notes-nav a > span")
        .evaluateAll((numbers) =>
          numbers.some((number) => {
            const range = document.createRange();
            range.selectNodeContents(number);
            return (
              new Set(
                Array.from(range.getClientRects(), (rect) =>
                  Math.round(rect.top),
                ),
              ).size !== 1
            );
          }),
        );
      expect(split, `${width}px ${size}`).toBe(false);
    }
  }
});

test("professional positioning leads the homepage, with the name secondary", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Observability & SRE Leader",
  );
  const hierarchy = await page.evaluate(() => ({
    headline: parseFloat(
      getComputedStyle(document.querySelector("h1")!).fontSize,
    ),
    name: parseFloat(
      getComputedStyle(document.querySelector(".intro-name")!).fontSize,
    ),
  }));
  expect(hierarchy.headline).toBeGreaterThan(hierarchy.name * 2);
});

test("notes flow into contact without overlap or percentage-sized vertical gaps", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/");
    for (const fontSize of ["100%", "200%"]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, fontSize);
      const bounds = await page.evaluate(() => {
        const rect = (selector: string) =>
          document.querySelector(selector)!.getBoundingClientRect();
        const nav = rect(".notes-nav"),
          body = rect(".notes-body");
        return {
          contained: body.bottom <= rect(".notes-layout").bottom + 1,
          overlap: rect("#people").bottom - rect(".notes-contact").top,
          gap: body.top >= nav.bottom ? body.top - nav.bottom : 0,
        };
      });
      expect(bounds.contained, `${width}px ${fontSize}`).toBe(true);
      expect(bounds.overlap, `${width}px ${fontSize}`).toBeLessThanOrEqual(1);
      expect(bounds.gap, `${width}px ${fontSize}`).toBeLessThanOrEqual(48);
    }
  }
});

test("leadership graphic keeps its text and caption apart at enlarged text size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const fits = await page.locator(".people-art").evaluate((art) => {
    const type = art.querySelector(".type-art")!,
      caption = art.querySelector(".art-caption")!;
    const bounds = type.getBoundingClientRect(),
      area = art.getBoundingClientRect();
    return (
      bounds.bottom <= caption.getBoundingClientRect().top &&
      bounds.left >= area.left &&
      bounds.right <= area.right
    );
  });
  expect(fits).toBe(true);
});

test("maximum interference does not clip the trace at the canvas edge", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSignal(page);
  await page.getByRole("slider", { name: "Signal noise" }).fill("100");
  const touchesEdge = await page
    .locator(".signal-field canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas
        .getContext("2d")!
        .getImageData(0, canvas.height - 1, canvas.width, 1).data;
      return data.some((value, index) => index % 4 === 3 && value !== 0);
    });
  expect(touchesEdge).toBe(false);
});
