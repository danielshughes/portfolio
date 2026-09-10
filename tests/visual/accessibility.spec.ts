import { expect, test } from "@playwright/test";
import { openSignal } from "./helpers";

for (const route of ["/", "/notes/"]) {
  test(`${route} supports increased text spacing without horizontal scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    // Emulate user spacing through permitted style attributes, keeping the
    // generated script/style-element CSP enforced for the rest of the page.
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>("*")) {
        element.style.setProperty("letter-spacing", ".12em", "important");
        element.style.setProperty("word-spacing", ".16em", "important");
        element.style.setProperty("line-height", "1.5", "important");
        if (element.tagName === "P")
          element.style.setProperty("margin-bottom", "2em", "important");
      }
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("contact focus indicator has contrast against its coloured surface", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  const link = page.locator(".contact-title");
  await link.focus();
  const contrast = await link.evaluate((element) => {
    const luminance = (colour: string) => {
      const channels = colour
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const s = value / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const outline = luminance(getComputedStyle(element).outlineColor);
    const surface = luminance(
      getComputedStyle(element.closest("section")!).backgroundColor,
    );
    return (
      (Math.max(outline, surface) + 0.05) / (Math.min(outline, surface) + 0.05)
    );
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
});

for (const route of ["/", "/notes/"]) {
  test(`${route} skip link moves keyboard focus into main content`, async ({
    page,
    browserName,
  }) => {
    await page.goto(route);
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
}

test("mobile keyboard order matches the visible header", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const targets = [
    page.getByRole("link", { name: "Skip to content" }),
    page.getByRole("link", { name: "Dan Hughes portfolio home" }),
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Notes", exact: true }),
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Experiments", exact: true }),
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Contact" }),
    page.getByRole("button", { name: /^Colour theme:/ }),
  ];
  for (const target of targets) {
    await page.keyboard.press(tab);
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport();
  }
});

test("signal slider exposes useful values and description to assistive technology", async ({
  page,
}) => {
  await openSignal(page);
  const slider = page.getByRole("slider", { name: "Signal noise" });
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "25 of 100, low interference",
  );
  await expect(slider).toHaveAccessibleDescription(
    /Synthetic waves.*reference above stays clean/,
  );
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "100 of 100, high interference",
  );
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "0 of 100, no interference",
  );
});

test("project links have concise names and contact has a landmark", async ({
  page,
}) => {
  await page.goto("/");
  for (const link of await page.locator(".project").all()) {
    await expect(link).toHaveAttribute("aria-labelledby", /.+/);
    const name = await link.getAttribute("aria-labelledby");
    expect(await page.locator(`[id="${name}"]`).count()).toBe(1);
  }
  await expect(page.getByRole("region", { name: "Say hello" })).toBeVisible();
});
