import { expect, test, type Locator } from "@playwright/test";
import { radar } from "./radar-fixture";

const summaries = {
  bots: ["human", "bot"],
  devices: ["desktop", "mobile", "other"],
  protocols: ["HTTP/1.x", "HTTP/2", "HTTP/3"],
};

for (const theme of ["light", "dark"] as const)
  test(`Radar has one footer with grouped guidance and a right-column credit in ${theme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.route("**/api/radar?*", (route) => {
      const url = new URL(route.request().url());
      const view = url.searchParams.get("view") as keyof typeof summaries;
      return route.fulfill({
        json: view
          ? {
              ...radar(),
              view,
              categories: summaries[view].map((label, index, values) => ({
                label,
                value: index ? 20 : 100 - (values.length - 1) * 20,
              })),
            }
          : radar(),
      });
    });
    await page.goto("/experiments/#internet");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      const map = page.locator("#internet");
      await map.getByRole("tab", { name: "Traffic", exact: true }).click();
      await expect(map.locator(".internet-value")).toHaveText("50");
      for (const name of ["Traffic", "Bots", "Devices", "Protocols"]) {
        await map.getByRole("tab", { name, exact: true }).click();
        await expect(map).toHaveAttribute("aria-busy", "false");
        const footer = map.locator(".internet-bottom");
        await map.screenshot({
          path: test
            .info()
            .outputPath(
              `radar-footer-${width}-${name.toLowerCase()}-${theme}.png`,
            ),
        });
        await expect(footer.getByRole("heading")).toHaveCount(1);
        if (name === "Traffic") {
          await expect(
            footer.getByRole("heading", {
              name: "Reported disruptions",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            footer.getByText(/No reported events does not mean no outages/),
          ).toBeVisible();
          await expect(
            footer.getByText(
              /Relative traffic, not uptime or absolute country volumes/,
            ),
          ).toBeVisible();
        } else {
          await expect(
            footer.getByRole("heading", {
              name: "About these shares",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            footer.getByText(/not a census of the entire Internet/),
          ).toBeVisible();
          await expect(
            footer.getByRole("heading", {
              name: "Reported disruptions",
              exact: true,
            }),
          ).toHaveCount(0);
        }
        expect(
          await footer.evaluate((root) => {
            const heading = [...root.querySelectorAll("h3")].find(
              (element) => getComputedStyle(element).visibility !== "hidden",
            )!;
            const paragraphs = [
              ...root.querySelectorAll<HTMLElement>("p"),
            ].filter(
              (element) => getComputedStyle(element).visibility !== "hidden",
            );
            const text = paragraphs.at(-1)!;
            const bounds = root.getBoundingClientRect();
            const box = text.getBoundingClientRect();
            return (
              Math.abs(heading.getBoundingClientRect().left - bounds.left) <
                1 &&
              Math.abs(box.width - bounds.width) < 1 &&
              bounds.bottom - box.bottom <=
                parseFloat(getComputedStyle(text).lineHeight) + 1
            );
          }),
        ).toBe(true);
        await expect(
          map.locator(
            '.internet-bottom a[href="https://radar.cloudflare.com/"], .internet-attribution a[href="https://radar.cloudflare.com/"]',
          ),
        ).toHaveCount(1);
        const placement = await map.evaluate((root) => {
          const bounds = (selector: string) => {
            const { left, right, top, bottom } = root
              .querySelector(selector)!
              .getBoundingClientRect();
            return { left, right, top, bottom };
          };
          return {
            context: bounds(".internet-bottom"),
            credit: bounds(".internet-attribution"),
            guide: bounds(".radar-guide"),
            description: bounds(".radar-description-slot"),
            containsAll: [
              ".radar-description-slot",
              ".radar-guide",
              ".internet-bottom",
              ".internet-attribution",
            ].every((selector) =>
              root
                .querySelector(".internet-footer")!
                .contains(root.querySelector(selector)),
            ),
          };
        });
        expect(placement.containsAll).toBe(true);
        expect(placement.credit.top).toBeGreaterThanOrEqual(
          placement.guide.bottom,
        );
        expect(
          placement.credit.top - placement.guide.bottom,
        ).toBeLessThanOrEqual(16);
        if (width > 1000) {
          expect(placement.credit.left).toBeCloseTo(placement.guide.left, 0);
          expect(placement.credit.right).toBeCloseTo(placement.guide.right, 0);
          expect(placement.guide.top).toBeCloseTo(placement.description.top, 0);
          expect(placement.credit.left).toBeGreaterThan(
            placement.context.right,
          );
        } else {
          expect(placement.credit.left).toBeCloseTo(placement.context.left, 0);
          expect(placement.guide.top).toBeGreaterThanOrEqual(
            placement.context.bottom,
          );
          expect(
            placement.guide.top - placement.context.bottom,
          ).toBeLessThanOrEqual(16);
        }
      }
    }
  });

test("manually opened disruption details stay open within the same event", async ({
  page,
}) => {
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({
      json: {
        ...radar(),
        outages: [
          {
            id: "authored-manual-detail",
            start: "2026-09-03T15:00:00Z",
            end: "2026-09-03T20:00:00Z",
            description: "Authored multi-hour disruption",
            scope: "country",
          },
        ],
      },
    }),
  );
  await page.goto("/experiments/#internet");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-value")).toHaveText("50");
  const slider = map.getByRole("slider");
  await slider.fill("2");
  const details = map.locator(".internet-event-details");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await slider.fill("3");
  await expect(details).toHaveAttribute("open", "");
  await slider.fill("8");
  await expect(details).toBeHidden();
  await slider.fill("3");
  await expect(details).not.toHaveAttribute("open", "");
  const eventButton = map.getByRole("button", {
    name: "View disruption 1",
    exact: true,
  });
  await eventButton.click();
  await expect(details).toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).not.toHaveAttribute("open", "");
  await eventButton.click();
  await expect(details).toHaveAttribute("open", "");
});

const geometry = (map: Locator) =>
  map.evaluate((root) => {
    const origin = root.getBoundingClientRect().top;
    return Object.fromEntries(
      [
        ".internet-surface",
        ".internet-countries",
        ".internet-country-name",
        ".internet-measure",
        ".internet-event-caption-slot",
        ".internet-history",
        ".internet-time-controls",
        ".internet-footer",
        ".internet-bottom",
        ".internet-attribution",
      ].map((selector) => {
        const box = root.querySelector(selector)!.getBoundingClientRect();
        return [selector, { top: box.top - origin, height: box.height }];
      }),
    );
  });

for (const viewport of [
  { width: 1440, text: 100 },
  { width: 390, text: 100 },
  { width: 320, text: 200 },
])
  test(`initial Radar loading preserves country and control positions at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: 1000 });
    let release = () => {};
    let waiting = false;
    await page.route("**/api/radar?*", async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
        waiting = true;
      });
      await route.fulfill({ json: radar() });
    });
    await page.goto("/experiments/#internet");
    await page.evaluate((text) => {
      document.documentElement.style.fontSize = `${text}%`;
    }, viewport.text);
    const map = page.locator("#internet");
    await expect(map.locator(".internet-value")).toHaveText("Loading");
    await expect.poll(() => waiting).toBe(true);
    const before = await geometry(map);
    release();
    await expect(map.locator(".internet-value")).toHaveText("50");
    const after = await geometry(map);
    for (const selector of Object.keys(before)) {
      expect
        .soft(after[selector].top, selector)
        .toBeCloseTo(before[selector].top, 0);
      expect
        .soft(after[selector].height, selector)
        .toBeCloseTo(before[selector].height, 0);
    }
  });

for (const viewport of [
  { width: 1440, text: 100 },
  { width: 390, text: 100 },
  { width: 320, text: 200 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Radar tabs reserve their natural layout at ${viewport.width}px and ${viewport.text}% text in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "connection", {
          value: Object.assign(new EventTarget(), { saveData: true }),
        });
      });
      let release = () => {};
      let delay = false;
      let pendingRequest = false;
      await page.route("**/api/radar?*", async (route) => {
        const url = new URL(route.request().url());
        const country = url.searchParams.get("country")!;
        const view = url.searchParams.get("view") as keyof typeof summaries;
        if (delay)
          await new Promise<void>((resolve) => {
            release = resolve;
            pendingRequest = true;
          });
        const data = radar(country);
        await route.fulfill({
          json: view
            ? {
                ...data,
                view,
                categories: summaries[view].map((label, index, labels) => ({
                  label,
                  value: index === 0 ? 100 - (labels.length - 1) * 20 : 20,
                })),
              }
            : data,
        });
      });
      await page.goto("/experiments/#internet");
      await page.evaluate((text) => {
        document.documentElement.style.fontSize = `${text}%`;
      }, viewport.text);
      const map = page.locator("#internet");
      await expect(map.locator(".internet-value")).toHaveText("50");
      const before = await geometry(map);
      for (const name of ["Bots", "Devices", "Protocols", "Traffic"]) {
        delay = name !== "Traffic";
        pendingRequest = false;
        await map.getByRole("tab", { name, exact: true }).click();
        if (delay) {
          await expect(map).toHaveAttribute("aria-busy", "true");
          await expect.poll(() => pendingRequest).toBe(true);
          const pending = await geometry(map);
          for (const selector of Object.keys(before)) {
            expect
              .soft(pending[selector].top, `${name} pending ${selector} top`)
              .toBeCloseTo(before[selector].top, 0);
            expect
              .soft(
                pending[selector].height,
                `${name} pending ${selector} height`,
              )
              .toBeCloseTo(before[selector].height, 0);
          }
          release();
        }
        await expect(map).toHaveAttribute("aria-busy", "false");
        const after = await geometry(map);
        for (const selector of Object.keys(before)) {
          expect
            .soft(after[selector].top, `${name} ${selector} top`)
            .toBeCloseTo(before[selector].top, 0);
          expect
            .soft(after[selector].height, `${name} ${selector} height`)
            .toBeCloseTo(before[selector].height, 0);
        }
        if (name !== "Traffic") {
          await expect(map.getByRole("slider")).toHaveCount(0);
          await expect(
            map.getByRole("button", { name: "Play week", exact: true }),
          ).toHaveCount(0);
        }
      }
      delay = false;
      await map.getByRole("button", { name: "Japan", exact: true }).click();
      await expect(map.locator(".internet-country-name")).toHaveText("Japan");
      await expect(map).toHaveAttribute("aria-busy", "false");
      const country = await geometry(map);
      for (const selector of Object.keys(before)) {
        expect
          .soft(country[selector].top, `Japan ${selector} top`)
          .toBeCloseTo(before[selector].top, 0);
        expect
          .soft(country[selector].height, `Japan ${selector} height`)
          .toBeCloseTo(before[selector].height, 0);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}

test("ordinary disruption caption sits close to the traffic chart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({ json: radar() }),
  );
  await page.goto("/experiments/#internet");
  await expect(page.locator(".internet-value")).toHaveText("50");
  const gap = await page.locator(".radar-traffic").evaluate((root) => {
    const caption = root.querySelector(
      ".internet-event-caption, .internet-event-status",
    )!;
    const text = document.createRange();
    text.selectNodeContents(caption);
    return (
      root.querySelector(".internet-history")!.getBoundingClientRect().top -
      text.getBoundingClientRect().bottom
    );
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(16);
});

test("long selected disruption details preserve the traffic chart and controls", async ({
  page,
}) => {
  await page.route("**/api/radar?*", (route) =>
    route.fulfill({
      json: {
        ...radar(),
        outages: [
          {
            id: "authored-layout-event",
            start: "2026-09-04T13:15:00Z",
            end: "2026-09-04T13:40:00Z",
            description:
              "Authored disruption description with a deliberately detailed explanation of the reported network disruption and its geographical coverage. ".repeat(
                3,
              ),
            scope: "Authored regional scope",
          },
        ],
      },
    }),
  );
  await page.goto("/experiments/#internet");
  const map = page.locator("#internet");
  await expect(map.locator(".internet-value")).toHaveText("50");
  const positions = () =>
    map.locator(".internet-reading").evaluate((root) => {
      const origin = root.getBoundingClientRect().top;
      return [".internet-history", ".internet-time-controls"].map(
        (selector) =>
          root.querySelector(selector)!.getBoundingClientRect().top - origin,
      );
    });
  const before = await positions();
  await map
    .getByRole("button", { name: "View disruption 1", exact: true })
    .click();
  await expect(map.locator(".internet-event-status")).toContainText(
    "Nearest hourly sample",
  );
  const after = await positions();
  after.forEach((top, index) => expect(top).toBeCloseTo(before[index], 0));
  await expect(map.getByRole("slider")).toBeFocused();
});
