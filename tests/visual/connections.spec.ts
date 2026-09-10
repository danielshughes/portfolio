import { expect, test } from "@playwright/test";
import { setTheme } from "./helpers";

for (const reducedMotion of ["reduce", "no-preference"] as const)
  test(`connection nodes and complete curves stay within the viewBox with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/");
    const field = page.locator(".connection-field");
    await field.getByRole("button").click();
    await expect(field).toHaveAttribute(
      "data-motion",
      reducedMotion === "reduce" ? "idle" : "running",
    );
    const geometry = await field.locator("svg").evaluate((svg) => {
      const bounds = (svg as SVGSVGElement).viewBox.baseVal;
      const outside = (x: number, y: number, width: number, height: number) =>
        x < bounds.x ||
        y < bounds.y ||
        x + width > bounds.x + bounds.width ||
        y + height > bounds.y + bounds.height;
      const nodes = [
        ...svg.querySelectorAll<SVGCircleElement>(".connection-junction"),
      ];
      const paths = [...svg.querySelectorAll<SVGPathElement>("path")];
      const escapedNodes = nodes.flatMap((node, index) => {
        const radius =
          node.r.baseVal.value +
          parseFloat(getComputedStyle(node).strokeWidth) / 2;
        return outside(
          node.cx.baseVal.value - radius,
          node.cy.baseVal.value - radius,
          radius * 2,
          radius * 2,
        )
          ? [index]
          : [];
      });
      const escapedPaths = paths.flatMap((path, index) => {
        // getBBox includes the entire Bezier curve, not only its endpoints.
        // A wire also reserves the travelling pulse's radius at every position.
        const box = path.getBBox();
        const pulseRadius = path.classList.contains("connection-wire")
          ? (path.nextElementSibling as SVGCircleElement).r.baseVal.value
          : 0;
        const padding = Math.max(
          parseFloat(getComputedStyle(path).strokeWidth) / 2,
          pulseRadius,
        );
        return outside(
          box.x - padding,
          box.y - padding,
          box.width + padding * 2,
          box.height + padding * 2,
        )
          ? [index]
          : [];
      });
      return {
        nodeCount: nodes.length,
        pathCount: paths.length,
        escapedNodes,
        escapedPaths,
      };
    });
    expect(geometry.nodeCount).toBeGreaterThan(0);
    expect(geometry.pathCount).toBeGreaterThan(0);
    expect(geometry.escapedNodes).toEqual([]);
    expect(geometry.escapedPaths).toEqual([]);
  });

test("connection edges form unequal branches independently of node positions", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const field = page.locator(".connection-field");
  const structure = await field.evaluate((root) => {
    const nodes = [
      ...root.querySelectorAll<SVGCircleElement>(".connection-junction"),
    ];
    const edges = [
      ...root.querySelectorAll<SVGPathElement>(".connection-wire"),
    ].map((edge) => [Number(edge.dataset.from), Number(edge.dataset.to)]);
    const neighbours = nodes.map((_, index) =>
      edges.flatMap(([from, to]) =>
        from === index ? [to] : to === index ? [from] : [],
      ),
    );
    const hub = Number(
      nodes.reduce((largest, node) =>
        node.r.baseVal.value > largest.r.baseVal.value ? node : largest,
      ).dataset.junction,
    );
    const visited = new Set([hub]);
    const branches = neighbours[hub].map((start) => {
      const queue = [start];
      visited.add(start);
      for (const node of queue)
        for (const next of neighbours[node])
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
      return queue.length;
    });
    return {
      branches: branches.sort((a, b) => a - b),
      connected: visited.size === nodes.length,
      tree: edges.length === nodes.length - 1,
    };
  });
  expect(structure.connected).toBe(true);
  expect(structure.tree).toBe(true);
  // Removing the main junction leaves a short offshoot, a small chain and a larger branching component.
  expect(structure.branches).toEqual([1, 2, 7]);
});

for (const width of [390, 900, 1440])
  for (const theme of ["light", "dark"]) {
    test(`connection graphic fits the ${width}px ${theme} hero`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await setTheme(page, theme);
      const copy = (await page.locator(".opening-copy").boundingBox())!;
      const graphic = (await page.locator(".connection-field").boundingBox())!;
      if (width > 720) expect(graphic.x).toBeGreaterThan(copy.x + copy.width);
      else expect(graphic.y).toBeGreaterThanOrEqual(copy.y + copy.height);
      expect(graphic.x + graphic.width).toBeLessThanOrEqual(width);
      await expect(page.locator(".connection-field")).toHaveAttribute(
        "data-motion",
        "idle",
      );
      await page.screenshot({ path: testInfo.outputPath("hero.png") });
    });
  }

test("homepage has a distinct connection graphic, not a duplicate experiment", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".connection-field svg")).toBeVisible();
  await expect(page.locator(".signal-field")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Send a pulse through the connection graphic",
    }),
  ).toBeVisible();
  await page.goto("/experiments/");
  await expect(page.locator(".connection-field")).toHaveCount(0);
  await expect(page.locator(".signal-field")).toHaveCount(1);
});

test("keyboard pulses cancel when motion is reduced or offscreen", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const field = page.locator(".connection-field");
  const trigger = field.getByRole("button");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("data-motion", "running");
  await expect(field.locator(".connection-pulse").first()).toHaveAttribute(
    "opacity",
    "1",
  );
  await page.keyboard.press("Space");
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field).toHaveAttribute("data-motion", "idle");
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("data-motion", "idle");
  const preference = await page.evaluateHandle(() =>
    matchMedia("(prefers-reduced-motion: reduce)"),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Wait for an existing MediaQueryList to update, not a newly created query.
  await expect
    .poll(() => preference.evaluate((query) => query.matches))
    .toBe(false);
  await preference.dispose();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "idle");
});

test("visible connections keep pulsing from different nodes and resume after suspension", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await page.goto("/");
  const field = page.locator(".connection-field");
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.evaluate(() => {
    const graphic = document.querySelector(".connection-field")!;
    const origins: string[] = [];
    Object.assign(window, { connectionOrigins: origins });
    new MutationObserver(() => {
      const origin = graphic
        .querySelector("[data-active]")
        ?.getAttribute("data-junction");
      if (origin && origin !== origins.at(-1)) origins.push(origin);
    }).observe(graphic, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-active"],
    });
  });
  await page.clock.runFor(9000);
  const origins = await page.evaluate(
    () =>
      (window as unknown as { connectionOrigins: string[] }).connectionOrigins,
  );
  expect(origins.length).toBeGreaterThanOrEqual(3);
  expect(new Set(origins).size).toBeGreaterThanOrEqual(2);
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "idle");
  const paused = await field
    .locator(".connection-pulse")
    .evaluateAll((dots) => dots.map((dot) => dot.getAttribute("opacity")));
  expect(paused.every((value) => value === "0")).toBe(true);
  await page.clock.runFor(6000);
  await expect(field).toHaveAttribute("data-motion", "idle");
  await field.scrollIntoViewIfNeeded();
  await expect(field).toHaveAttribute("data-motion", "running");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(6000);
  await expect(field).toHaveAttribute("data-motion", "idle");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(field).toHaveAttribute("data-motion", "running");
});

test("connection graphic is static without JavaScript", async ({ browser }) => {
  const page = await browser.newPage({ javaScriptEnabled: false });
  await page.goto("http://127.0.0.1:4322/");
  await expect(page.locator(".connection-field svg")).toBeVisible();
  await expect(page.locator(".connection-field button")).toBeHidden();
  await expect(page.locator(".connection-field a")).toHaveAttribute(
    "href",
    "/experiments/",
  );
  await page.close();
});

test("touch can send a pulse without a hover prerequisite", async ({
  browser,
}) => {
  const page = await browser.newPage({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  await page.goto("http://127.0.0.1:4322/");
  await page.locator(".connection-field button").tap();
  await expect(page.locator(".connection-field")).toHaveAttribute(
    "data-motion",
    "running",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.close();
});
