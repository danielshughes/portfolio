import { expect, test } from "@playwright/test";
import { setTheme } from "./helpers";

test("theme control is a quiet icon with a full touch target", async ({
  page,
}) => {
  await page.goto("/");
  const control = page.locator(".theme-control");
  const style = await control.evaluate((element) => ({
    border: getComputedStyle(element).borderTopWidth,
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
    icon: element.querySelector("svg")!.getBoundingClientRect().width,
  }));
  expect(style.border).toBe("0px");
  expect(style.icon).toBeLessThanOrEqual(18);
  expect(style.width).toBeGreaterThanOrEqual(44);
  expect(style.height).toBeGreaterThanOrEqual(44);
});

test("theme icon remembers a reload and follows changes from another tab", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await setTheme(page, "dark");
  await page.reload();
  await expect(page.locator(".theme-control")).toHaveAttribute(
    "data-choice",
    "dark",
  );
  const other = await context.newPage();
  await other.goto("/notes/");
  await setTheme(other, "light");
  await expect(page.locator(".theme-control")).toHaveAttribute(
    "data-choice",
    "light",
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await other.close();
});

test("invalid saved themes fall back to system preference", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("portfolio-theme", "invalid"),
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".theme-control")).toHaveAttribute(
    "data-choice",
    "system",
  );
});

test("theme icon cycles system, light and dark using the keyboard", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /^Colour theme:/ });
  await expect(toggle).toHaveAttribute("data-choice", "system");
  await expect(toggle).toHaveAccessibleName(
    "Colour theme: System. Switch to Light.",
  );
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await toggle.focus();
  for (const [key, choice, next] of [
    ["Enter", "light", "Dark"],
    ["Space", "dark", "System"],
    ["Enter", "system", "Light"],
  ]) {
    await page.keyboard.press(key);
    await expect(toggle).toHaveAttribute("data-choice", choice);
    await expect(toggle).toHaveAccessibleName(new RegExp(`Switch to ${next}`));
    await expect(toggle).toBeFocused();
    const opacity = await toggle
      .locator(`[data-icon="${choice}"]`)
      .evaluate((icon) => getComputedStyle(icon).opacity);
    expect(opacity).toBe("1");
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("data-choice", "system");
});

test("keyboard focus and skip link remain legible in dark mode", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await skip.focus();
  const colours = await skip.evaluate((link) => {
    const style = getComputedStyle(link);
    return {
      colour: style.color,
      background: style.backgroundColor,
      outline: style.outlineColor,
    };
  });
  expect(colours.colour).toBe("rgb(23, 28, 27)");
  expect(colours.background).toBe("rgb(236, 237, 230)");
  expect(colours.outline).toBe("rgb(255, 154, 115)");
});
