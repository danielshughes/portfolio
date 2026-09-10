import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`shared typography roles at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const shared = [];
      for (const route of ["/", "/notes/", "/experiments/"]) {
        await page.goto(route);
        const actual = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const read = (selector: string) => {
            const style = getComputedStyle(document.querySelector(selector)!);
            return {
              family: style.fontFamily,
              size: style.fontSize,
              weight: style.fontWeight,
            };
          };
          return {
            tokens: [
              "--body",
              "--mono",
              "--type-body",
              "--type-small",
              "--type-caption",
            ].map((name) => root.getPropertyValue(name).trim()),
            nav: read(".site-header nav a"),
            eyebrow: read(".eyebrow"),
            footer: read(".site-footer"),
            headings: [...document.querySelectorAll("h1, h2, h3")].map(
              (element) => {
                const style = getComputedStyle(element);
                return {
                  text: element.textContent?.trim(),
                  terminal: element.matches(".terminal-subtitle-heading"),
                  family: style.fontFamily,
                  weight: style.fontWeight,
                };
              },
            ),
          };
        });
        expect(actual.tokens.every(Boolean)).toBe(true);
        for (const heading of actual.headings) {
          if (heading.terminal) {
            expect(
              heading.family,
              "terminal subtitle uses the shared monospace face",
            ).toBe(actual.eyebrow.family);
          } else {
            expect(heading.family, heading.text).toContain(
              "Space Grotesk Variable",
            );
          }
          expect(heading.weight, heading.text).toBe("500");
        }
        expect(actual.eyebrow.size).toBe("13px");
        expect(actual.eyebrow.weight).toBe("400");
        shared.push({
          nav: actual.nav,
          eyebrow: actual.eyebrow,
          footer: actual.footer,
        });
      }
      expect(shared[1]).toEqual(shared[0]);
      expect(shared[2]).toEqual(shared[0]);

      const card = page.locator("#kubernetes");
      await card.locator(".experiment-settings > summary").click();
      const actual = await card.evaluate((root) => {
        const read = (selector: string) => {
          const style = getComputedStyle(root.querySelector(selector)!);
          return {
            family: style.fontFamily,
            size: style.fontSize,
            weight: style.fontWeight,
            lineHeight: style.lineHeight,
          };
        };
        return {
          output: read("output"),
          label: read(".experiment-controls label"),
          caption: read(".experiment-footnote"),
          control: read(".experiment-controls button"),
        };
      });
      expect(actual.output.family).toContain("Manrope Variable");
      expect(actual.output.size).toBe("14px");
      expect(parseFloat(actual.output.lineHeight)).toBeCloseTo(23.8, 1);
      expect(actual.label.size).toBe("14px");
      expect(actual.caption.size).toBe("13px");
      expect(actual.control.size).toBe("14px");
      expect(actual.control.family).toBe(shared[0].eyebrow.family);
    });
  }
}
