import { test, expect } from "@playwright/test";

test("Worker policy permits theme, SVG and optional modules without CSP violations", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { policyViolations: [] });
    document.addEventListener("securitypolicyviolation", (event) => {
      (
        window as Window & { policyViolations?: string[] }
      ).policyViolations!.push(event.violatedDirective);
    });
  });
  for (const path of ["/", "/notes/", "/experiments/"]) {
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const theme = page.getByRole("button", { name: /^Colour theme:/ });
    await theme.click();
    await expect(theme).toHaveAttribute("data-choice", /light|dark|system/);
    expect(
      await page
        .locator(".signature-trace")
        .evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThan(0);
    const source = page.locator(".site-footer a", { hasText: "View source" });
    await expect(source).toHaveAttribute("target", "_blank");
    await expect(source).toHaveAccessibleDescription("Opens in a new tab");
    if (path === "/experiments/") {
      const experiment = page.locator('[data-experiment="latency"]');
      await experiment.locator("summary").click();
      await expect(experiment).toHaveClass(/experiment-ready/);
    }
    expect(
      await page.evaluate(
        () =>
          (window as Window & { policyViolations?: string[] }).policyViolations,
      ),
    ).toEqual([]);
  }
});
