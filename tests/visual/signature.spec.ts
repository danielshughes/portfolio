import { expect, test, type Locator } from "@playwright/test";

for (const route of ["/", "/notes/", "/experiments/"]) {
  test(`touch navigation from ${route} draws on arrival without delaying the link`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      hasTouch: true,
      isMobile: browserName !== "firefox",
    });
    await context.addInitScript(() => {
      let starts = 0;
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.closest(".signature-trace")) starts++;
        return animate.apply(this, args);
      };
      document.addEventListener("click", (event) => {
        const mark = document.querySelector(".site-mark")!;
        if (!(event.target instanceof Node) || !mark.contains(event.target))
          return;
        console.debug(
          "signature-before-navigation",
          JSON.stringify({
            starts,
            offset: getComputedStyle(mark.querySelector("path")!)
              .strokeDashoffset,
            opacity: getComputedStyle(mark.querySelector("circle")!).opacity,
          }),
        );
      });
    });
    const page = await context.newPage();
    const outgoing = Promise.withResolvers<{
      starts: number;
      offset: string;
      opacity: string;
    }>();
    page.on("console", (message) => {
      const prefix = "signature-before-navigation ";
      if (message.text().startsWith(prefix))
        outgoing.resolve(JSON.parse(message.text().slice(prefix.length)));
    });
    await page.goto(route);
    await page.evaluate(() => {
      document.documentElement.dataset.signatureDocument = "outgoing";
    });
    const responseGate = Promise.withResolvers<void>();
    const requested = Promise.withResolvers<void>();
    await page.route(new URL("/", baseURL).href, async (request) => {
      requested.resolve();
      await responseGate.promise;
      await request.continue();
    });
    const tap = page.locator(".site-mark").tap();
    try {
      // Capture before navigation: Chromium defers evaluation until it commits.
      await requested.promise;
      expect(await outgoing.promise).toEqual({
        starts: 0,
        offset: "0px",
        opacity: "1",
      });
    } finally {
      responseGate.resolve();
      await tap;
    }
    // A new document proves even home-to-home navigation actually happened.
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-signature-document",
      "outgoing",
    );
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    const mark = page.locator(".site-mark");
    await pauseDuringStroke(mark);
    await expectPartialStroke(mark);
    await finishStroke(mark);
    await expect(page.locator(".site-mark path")).toHaveCSS(
      "stroke-dashoffset",
      "0px",
    );
    await expect(page.locator(".site-mark circle")).toHaveCSS("opacity", "1");
    await page.reload();
    expect(
      await mark.evaluate(
        (root) => root.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await context.close();
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`arrival reveals only the drawing stroke in ${colorScheme}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      colorScheme,
      hasTouch: true,
      viewport: { width: 402, height: 874 },
      isMobile: browserName !== "firefox",
    });
    await context.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (
          this.matches(".signature-trace path") &&
          !document.documentElement.hasAttribute("data-signature-before-draw")
        ) {
          document.documentElement.dataset.signatureBeforeDraw =
            getComputedStyle(this.closest("svg")!).visibility;
          document.documentElement.dataset.signatureDrawReady =
            document.readyState;
        }
        const run = animate.apply(this, args);
        if (this.closest(".signature-trace")) run.pause();
        return run;
      };
    });
    const page = await context.newPage();
    await page.goto("/notes/");
    const mark = page.locator(".site-mark");
    await mark.tap();
    await pauseDuringStroke(mark);
    expect(
      await page.evaluate(
        () =>
          CSS.supports("selector(:active-view-transition)") &&
          document.documentElement.matches(":active-view-transition"),
      ),
    ).toBe(false);
    await expect(page.locator("html")).toHaveAttribute(
      "data-signature-draw-ready",
      "complete",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-signature-before-draw",
      "hidden",
    );
    await expect(mark.locator("svg")).toBeVisible();
    await expectPartialStroke(mark);
    await page.screenshot({
      path: test.info().outputPath("arrival-drawing.png"),
    });
    await finishStroke(mark);
    await page.screenshot({
      path: test.info().outputPath("arrival-complete.png"),
    });
    await context.close();
  });
}

for (const fallback of ["reduced motion", "blocked storage", "failed module"]) {
  test(`touch navigation stays usable with ${fallback}`, async ({
    browser,
    browserName,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 402, height: 874 },
      hasTouch: true,
      isMobile: browserName !== "firefox",
      reducedMotion: fallback === "reduced motion" ? "reduce" : "no-preference",
    });
    if (fallback === "blocked storage") {
      await context.addInitScript(() => {
        Storage.prototype.setItem = () => {
          throw new DOMException("Storage blocked", "SecurityError");
        };
      });
    }
    const page = await context.newPage();
    await page.goto("/notes/");
    if (fallback === "failed module") {
      // Astro can inline small modules, so block the actual enhancement scripts.
      await page.route(new URL("/", baseURL).href, async (route) => {
        const response = await route.fetch();
        const html = await response.text();
        expect(html).toContain('<script type="module">');
        await route.fulfill({
          response,
          body: html.replace(/<script type="module">[\s\S]*?<\/script>/g, ""),
        });
      });
    }
    await page.locator(".site-mark").tap();
    await expect(page).toHaveURL(new URL("/", baseURL).href);
    const mark = page.locator(".site-mark");
    await expect(mark.locator("svg")).toBeVisible();
    await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
    await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
    expect(
      await mark.evaluate(
        (root) => root.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await context.close();
  });
}

test("touch focus stays static while keyboard focus still draws on a touch device", async ({
  browser,
  browserName,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 402, height: 874 },
    hasTouch: true,
    isMobile: browserName !== "firefox",
  });
  const page = await context.newPage();
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await page.touchscreen.tap(350, 300);
  await mark.focus();
  expect(await mark.evaluate((root) => root.matches(":focus-visible"))).toBe(
    false,
  );
  expect(
    await mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.locator("nav a").first().focus();
  await page.keyboard.press("Tab");
  await mark.focus();
  expect(await mark.evaluate((root) => root.matches(":focus-visible"))).toBe(
    true,
  );
  await pauseDuringStroke(mark);
  await expectPartialStroke(mark);
  await page.locator("nav a").first().focus();
  await mark.evaluate((root) => {
    for (const animation of root.getAnimations({ subtree: true }))
      animation.play();
  });
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await context.close();
});

test("pressed pointer entry stays static until an unpressed hover", async ({
  page,
}) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  for (const pointerType of ["mouse", "pen"]) {
    await mark.dispatchEvent("pointerenter", { pointerType, buttons: 1 });
    expect(
      await mark.evaluate(
        (root) => root.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
  }
  await mark.hover();
  await pauseDuringStroke(mark);
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

async function pauseDuringStroke(mark: Locator) {
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(2);
  await mark.evaluate((root) => {
    for (const animation of root.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 200;
      animation.id = "authored-signature-run";
    }
  });
}

async function expectPartialStroke(mark: Locator) {
  const offset = await mark
    .locator("path")
    .evaluate((path) => parseFloat(getComputedStyle(path).strokeDashoffset));
  expect(offset).toBeGreaterThan(0);
  expect(offset).toBeLessThan(100);
  await expect(mark.locator("circle")).toHaveCSS("opacity", "0");
}

async function finishStroke(mark: Locator) {
  await mark.evaluate((root) =>
    root
      .getAnimations({ subtree: true })
      .forEach((animation) => animation.finish()),
  );
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
}

test("signature finishes after pointer leave and does not restart while drawing", async ({
  page,
}) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.hover();
  await pauseDuringStroke(mark);
  await page.mouse.move(300, 300);
  await expectPartialStroke(mark);
  await mark.hover();
  expect(
    await mark.evaluate((root) =>
      root
        .getAnimations({ subtree: true })
        .every((animation) => animation.id === "authored-signature-run"),
    ),
  ).toBe(true);
  await expectPartialStroke(mark);
  await mark.evaluate((root) => {
    for (const animation of root.getAnimations({ subtree: true }))
      animation.play();
  });
  await page.mouse.move(300, 300);
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await mark.hover();
  await pauseDuringStroke(mark);
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

test("signature finishes after keyboard focus moves away", async ({ page }) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.focus();
  await pauseDuringStroke(mark);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Notes", exact: true })
    .focus();
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

test("reduced motion cancels a drawing safely and waits for a new interaction", async ({
  page,
}) => {
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.hover();
  await pauseDuringStroke(mark);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
    )
    .toBe(0);
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(
    await mark.evaluate((root) => root.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.mouse.move(300, 300);
  await mark.hover();
  await pauseDuringStroke(mark);
  await expectPartialStroke(mark);
  await finishStroke(mark);
});

test("signature stays complete with scripts disabled and reduced motion", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  const mark = page.locator(".site-mark");
  await mark.hover();
  await expect(mark.locator("path")).toHaveCSS("stroke-dashoffset", "0px");
  await expect(mark.locator("circle")).toHaveCSS("opacity", "1");
  await context.close();
});
