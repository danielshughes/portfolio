import { test, expect } from "@playwright/test";

test("shared heading scale reflows at 320px with doubled text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const overflow = await page.locator("main *").evaluateAll((els) =>
    els
      .filter(
        (el) =>
          !(el instanceof SVGElement) &&
          el.getBoundingClientRect().right > innerWidth + 1,
      )
      .map((el) => ({
        tag: el.tagName,
        name: el.className,
        right: el.getBoundingClientRect().right,
      })),
  );
  expect(overflow).toEqual([]);
  const sizes = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        name: el.getAttribute("class"),
        right: el.getBoundingClientRect().right,
      })),
  }));
  const innerOverflow = await page.locator("body *").evaluateAll((els) =>
    els
      .filter((el) => el.clientWidth && el.scrollWidth > el.clientWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        name: el.getAttribute("class"),
        width: el.clientWidth,
        scroll: el.scrollWidth,
      })),
  );
  expect(sizes.width, JSON.stringify({ sizes, innerOverflow })).toBe(320);
});

test("compact-screen heading scale leaves room for surrounding content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 585, height: 958 });
  await page.goto("/");
  expect(
    await page
      .locator("h1")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeLessThanOrEqual(44);
  expect(
    await page
      .locator(".opening-copy p")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  for (const route of ["/notes/", "/experiments/"]) {
    await page.goto(route);
    expect(
      await page
        .locator("h1")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeLessThanOrEqual(44);
  }
});

for (const width of [390, 585, 900, 1440])
  for (const theme of ["light", "dark"] as const)
    test(`shared rhythm at ${width} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const paddings: number[] = [];
      for (const [route, selectors] of [
        ["/", [".selected-work", ".off-clock"]],
        ["/notes/", [".notes-intro", ".engineering-note"]],
        ["/experiments/", [".play-intro", ".play-outro"]],
      ] as const) {
        await page.goto(route);
        const geometry = await page
          .locator(selectors.join(","))
          .evaluateAll((els) =>
            els.map((el) => {
              const box = el.getBoundingClientRect(),
                style = getComputedStyle(el);
              return {
                top: box.top + scrollY,
                bottom: box.bottom + scrollY,
                height: box.height,
                padding: parseFloat(style.paddingTop),
              };
            }),
          );
        paddings.push(...geometry.map((box) => box.padding));
        await test.info().attach(`${route}-geometry`, {
          body: JSON.stringify(geometry),
          contentType: "application/json",
        });
        for (let index = 1; index < geometry.length; index++)
          // DOMRect edges can differ by a fraction of a CSS layout unit.
          expect(geometry[index].top).toBeGreaterThanOrEqual(
            geometry[index - 1].bottom - 0.01,
          );
        await page.screenshot({
          path: test
            .info()
            .outputPath(
              `${route.replaceAll("/", "") || "home"}-${width}-${theme}.png`,
            ),
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      expect(new Set(paddings).size).toBe(1);
      expect(paddings[0]).toBeLessThanOrEqual(width <= 720 ? 32 : 48);
    });

test("home connections keep their asymmetric layout, stable frame and header mark", async ({
  page,
}) => {
  await page.goto("/");
  const positions = () =>
    page
      .locator(".connection-junction")
      .evaluateAll((nodes) =>
        nodes.map((node) => [
          Number(node.getAttribute("cx")),
          Number(node.getAttribute("cy")),
        ]),
      );
  const before = await positions();
  const hub = before[2][0];
  expect(
    before.filter(([x]) => x > hub).length -
      before.filter(([x]) => x < hub).length,
  ).toBeGreaterThanOrEqual(3);
  expect(new Set(before.map((node) => node[1])).size).toBeGreaterThanOrEqual(7);
  const frame = await page.locator(".connection-surface").boundingBox();
  expect(await page.locator(".connection-signature").count()).toBe(0);
  expect(await page.locator(".site-mark .signature-trace").count()).toBe(1);
  await page.reload();
  expect(await positions()).toEqual(before);
  expect(await page.locator(".connection-surface").boundingBox()).toEqual(
    frame,
  );
});
