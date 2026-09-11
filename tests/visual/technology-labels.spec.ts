import { test, expect } from "@playwright/test";

test.use({ javaScriptEnabled: false });

const technologies = {
  kubernetes: "Kubernetes HPA / SVG simulation",
  mcp: "Agents + MCP / scripted SVG simulation",
  wave: "Canvas 2D / synthetic interference",
  latency: "SVG / synthetic latency",
  requests: "SVG / concurrency simulation",
  world: "Canvas 2D / imaginary 3D topology",
  edge: "Workers / request.cf metadata",
  health: "Cron Triggers + D1 / asset checks",
  stream: "Workers / Streams API",
  room: "Durable Objects / WebSockets",
  triage: "Workers AI + Turnstile / synthetic incidents",
  internet: "Cloudflare Radar / Workers + KV",
};

for (const width of [320, 390, 1280]) {
  test(`technology labels are readable without opening experiments at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/experiments/");
    for (const [id, technology] of Object.entries(technologies)) {
      const section = page.locator(`#${id}`);
      const label = section.locator(
        id === "internet" ? ".eyebrow" : ".stage-label",
      );
      await expect(label).toHaveText(technology);
      await expect(label).toBeVisible();
      expect(await label.evaluate((el) => el.closest("details"))).toBeNull();
      const outer = (await section.boundingBox())!;
      const inner = (await label.boundingBox())!;
      expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
      expect(inner.x + inner.width).toBeLessThanOrEqual(
        outer.x + outer.width + 1,
      );
      expect(
        await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  });
}
