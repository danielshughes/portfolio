import { test, expect } from "@playwright/test";
import { radar } from "./radar-fixture";
import { serveFixture } from "./http-fixture";

test("failed optional chunk offers a functional page reload", async ({
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
  let available = false;
  let chunkRequests = 0;
  const server = await serveFixture((request, response) => {
    if (request.url?.startsWith("/api/radar?")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(radar()));
      return true;
    }
    if (/\/charts\..*\.js$/.test(request.url ?? "")) {
      chunkRequests++;
      if (!available) {
        response.writeHead(503, {
          "Content-Type": "text/javascript",
          "Cache-Control": "no-store",
        });
        response.end();
        return true;
      }
    }
    return false;
  });
  try {
    const initial = await page.goto(`${server.url}/experiments/`);
    expect(initial?.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
    expect(initial?.headers()["content-security-policy"]).toContain("'sha256-");
    expect(initial?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    const card = page.locator("#latency");
    await card.locator("summary").first().click();
    await expect(card.locator("output")).toContainText("Reload the page");
    await expect(card.locator(".experiment-preview")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as Window & { policyViolations?: string[] }).policyViolations,
      ),
    ).toEqual([]);
    available = true;
    const documentHandle = await page.evaluateHandle(() => document);
    const [reloaded] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().isNavigationRequest() &&
          response.url() === `${server.url}/experiments/`,
      ),
      page.waitForEvent("framenavigated", {
        predicate: (frame) => frame === page.mainFrame(),
      }),
      card.getByRole("button", { name: "Reload page" }).click(),
    ]);
    await page.waitForLoadState("load");
    expect(reloaded.headers()["content-security-policy"]).toBe(
      initial?.headers()["content-security-policy"],
    );
    expect(reloaded.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(
      documentHandle.evaluate((node) => node.isConnected),
    ).rejects.toThrow();
    await expect(card.getByRole("button", { name: "Reload page" })).toHaveCount(
      0,
    );
    await expect(page.locator(".preview-toggle")).toBeVisible();
    if (
      !(await card
        .locator(".experiment-settings")
        .evaluate((el: HTMLDetailsElement) => el.open))
    )
      await card.locator("summary").first().press("Enter");
    await expect(card.locator(".experiment-settings")).toHaveAttribute(
      "open",
      "",
    );
    await expect(card).toHaveClass(/experiment-ready/);
    expect(chunkRequests).toBe(2);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { policyViolations?: string[] }).policyViolations,
      ),
    ).toEqual([]);
  } finally {
    await server.close();
  }
});
