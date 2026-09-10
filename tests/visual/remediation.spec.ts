import { test, expect } from "@playwright/test";
import { radar } from "./radar-fixture";
import { serveFixture } from "./http-fixture";

// Authored edge cases, not recorded observations.
for (const [start, end, hour] of [
  ["2026-09-03T13:15:00Z", "2026-09-03T13:45:00Z", "0"],
  ["2026-09-03T12:45:00Z", "2026-09-03T13:15:00Z", "0"],
  ["2026-09-10T12:45:00Z", "2026-09-10T13:00:00Z", "167"],
]) {
  test(`selected disruption retains actual interval ${start}`, async ({
    page,
  }) => {
    await page.route("**/api/radar?*", (route) =>
      route.fulfill({
        json: {
          ...radar(new URL(route.request().url()).searchParams.get("country")!),
          view:
            new URL(route.request().url()).searchParams.get("view") ??
            "traffic",
          categories: [
            { label: "human", value: 70 },
            { label: "bot", value: 30 },
          ],
          outages: [
            {
              id: "authored",
              start,
              end,
              description: "Authored short disruption",
              scope: "country",
            },
          ],
        },
      }),
    );
    await page.goto("/experiments/");
    const map = page.locator("#internet");
    await map.getByRole("button", { name: "View disruption 1" }).click();
    await expect(map.getByRole("slider")).toHaveValue(hour);
    await expect(map.locator(".internet-event-status")).toContainText(
      "Selected disruption: Authored short disruption",
    );
    await expect(map.locator(".internet-event-status")).toContainText(
      "Nearest hourly sample",
    );
    await expect(map.locator(".internet-event-status")).toContainText(
      start.slice(11, 16),
    );
    await expect(map.locator(".internet-event-status")).toContainText(
      end.slice(11, 16),
    );
    await expect(map.locator(".internet-value")).toHaveText("50");
    await map.getByRole("slider").fill("1");
    await expect(map.locator(".internet-event-status")).not.toContainText(
      "Selected disruption",
    );
    await map.getByRole("button", { name: "View disruption 1" }).click();
    await map.getByRole("tab", { name: "Bots", exact: true }).click();
    await expect(map.locator(".internet-event-status")).not.toContainText(
      "Selected disruption",
    );
    await map.getByRole("tab", { name: "Traffic", exact: true }).click();
    await map.getByRole("button", { name: "View disruption 1" }).click();
    await map.getByRole("button", { name: "Japan", exact: true }).click();
    await expect(map.locator(".internet-event-status")).not.toContainText(
      "Selected disruption",
    );
    await map.getByRole("button", { name: "View disruption 1" }).click();
    await map.getByRole("button", { name: /^(Play|Replay) week$/ }).click();
    await expect(map.locator(".internet-event-status")).not.toContainText(
      "Selected disruption",
    );
  });
}

test("same-origin Radar requests retain an authored authentication cookie", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "qa_session",
      value: "authored-test-only",
      domain: "127.0.0.1",
      path: "/",
      secure: false,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  // Check the cookie at a real HTTP boundary: WebKit interception omits
  // network-added cookie headers from the exposed Playwright Request.
  const server = await serveFixture((request, response) => {
    if (request.url?.startsWith("/api/radar?")) {
      const authorised = request.headers.cookie?.includes(
        "qa_session=authored-test-only",
      );
      response.writeHead(authorised ? 200 : 401, {
        "Content-Type": "application/json",
      });
      response.end(
        JSON.stringify(
          authorised ? radar() : { error: "authored_unauthorised" },
        ),
      );
      return true;
    }
    return false;
  });
  try {
    await page.goto(`${server.url}/experiments/`);
    await expect(page.locator(".internet-source")).toHaveText(
      "Cloudflare Radar · observed data",
    );
  } finally {
    await server.close();
  }
});
