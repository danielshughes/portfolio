import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("edge artwork keeps moving while explored and live motion stops when inactive or reduced", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/experiments/#at-the-edge");
  for (const id of ["edge", "health", "triage", "room"]) {
    const card = page.locator(`[data-live="${id}"]`);
    const preview = card.locator(".experiment-visual");
    await preview.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute("data-preview-motion", "running");
    await expect
      .poll(() =>
        preview.evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === "running").length,
        ),
      )
      .toBeGreaterThan(0);
    await card.locator(".experiment-settings > summary").click();
    await expect(card).toHaveAttribute(
      "data-preview-motion",
      id === "edge" ? "running" : "paused",
    );
    const openedAnimations = expect.poll(() =>
      preview.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
    );
    if (id === "edge") await openedAnimations.toBeGreaterThan(0);
    else await openedAnimations.toBe(0);
    await card.locator(".experiment-settings > summary").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(card).toHaveAttribute("data-preview-motion", "paused");
    await expect
      .poll(() =>
        preview.evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.playState === "running").length,
        ),
      )
      .toBe(0);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  await page.locator("h1").scrollIntoViewIfNeeded();
  for (const card of await page.locator("[data-live]").all()) {
    await expect(card).toHaveAttribute("data-preview-motion", "paused");
  }
});

test("the health preview shows cadence, never invented readings", async ({
  page,
}) => {
  await page.goto("/experiments/#at-the-edge");
  await expect(page.locator(".preview-live-health")).toBeVisible();
  await expect(page.locator(".health-figure")).not.toBeVisible();
  await expect(page.locator("[data-health-points]").locator("*")).toHaveCount(
    0,
  );
  await expect(page.locator("[data-health-line]")).not.toHaveAttribute(
    "d",
    /.+/,
  );
  await page.locator('[data-live="health"] > details > summary').click();
  await expect(page.locator(".preview-live-health")).not.toBeVisible();
  await expect(page.locator(".health-figure")).toBeVisible();
  await expect(page.locator("[data-health-empty]")).toHaveText(
    "No samples yet.",
  );
});

test("live cards reuse the staggered gallery and stable Explore frames", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/experiments/#at-the-edge");
  const cards = page.locator("#at-the-edge .experiment");
  await expect(cards).toHaveCount(4);
  const [first, second] = await cards.evaluateAll((elements) =>
    elements
      .slice(0, 2)
      .map((element) => element.getBoundingClientRect().toJSON()),
  );
  expect(second.x).toBeGreaterThan(first.x + first.width);
  expect(second.y).toBeGreaterThan(first.y);
  for (let i = 0; i < 4; i++) {
    const card = cards.nth(i),
      summary = card.locator(".experiment-settings > summary");
    await summary.scrollIntoViewIfNeeded();
    const before = await card.locator(".experiment-stage").boundingBox();
    await summary.click();
    const after = await card.locator(".experiment-stage").boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
  }
});

test("live panels remain inside the page at double text size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/experiments/#at-the-edge");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const overflowing = await page.locator("#at-the-edge").evaluate((root) =>
    [...root.querySelectorAll("*")]
      .filter(
        (el) =>
          el.getBoundingClientRect().width > 0 &&
          el.getBoundingClientRect().right > innerWidth + 1,
      )
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent?.slice(0, 70),
        right: el.getBoundingClientRect().right,
      })),
  );
  expect(overflowing).toEqual([]);
});

test("real experiments load on request and model output is inert text", async ({
  page,
}) => {
  let inference = 0;
  await page.route("**/api/edge", (r) =>
    r.fulfill({
      json: {
        country: "GB",
        colo: "LHR",
        protocol: "HTTP/3",
        tls: "TLSv1.3",
        roundTripMs: 12,
        network: "Authored fixture",
      },
    }),
  );
  await page.route("**/api/triage?*", (r) => {
    inference++;
    return r.fulfill({
      json: {
        scenario: "latency",
        model: "fixture",
        answer:
          "<script>window.untrusted=true</script> Treat this as a hypothesis.",
      },
    });
  });
  await page.goto("/experiments/#at-the-edge");
  expect(inference).toBe(0);
  await page.locator('[data-live="edge"] > details > summary').click();
  await expect(page.locator("[data-edge-colo]")).toHaveText("LHR");
  await expect(page.locator("[data-edge-protocol]")).toHaveText("HTTP/3");
  await page.locator('[data-live="triage"] > details > summary').click();
  expect(inference).toBe(0);
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.locator("[data-triage-answer]")).toContainText("<script>");
  expect(await page.evaluate(() => Object.hasOwn(window, "untrusted"))).toBe(
    false,
  );
  expect(inference).toBe(1);
  const a11y = await new AxeBuilder({ page }).include("#at-the-edge").analyze();
  expect(a11y.violations).toEqual([]);
});
test("health history has an honest empty state and live panels reflow on iPhone-sized screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await page.goto("/experiments/#at-the-edge");
  await page.locator('[data-live="health"] > details > summary').click();
  await expect(page.locator("[data-health-status]")).toContainText(
    "No samples yet",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(402);
});
test("real shared state synchronises two clients and disconnects when closed", async ({
  page,
  context,
}) => {
  await page.goto("/experiments/#at-the-edge");
  const second = await context.newPage();
  await second.goto("/experiments/#at-the-edge");
  for (const p of [page, second]) {
    await p.locator('[data-live="room"] > details > summary').click();
    await p.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(p.locator("[data-room-status]")).toHaveText(
      "Connected. Send a pulse, or open this experiment in another visible window.",
    );
  }
  await page.getByRole("button", { name: "Send pulse", exact: true }).click();
  for (const p of [page, second])
    await expect(p.locator("[data-room-sequence]")).toHaveText(/\d+/);
  await expect(page.locator("[data-room-sequence]")).toHaveText(
    await second.locator("[data-room-sequence]").innerText(),
  );
  await page.locator('[data-live="room"] > details > summary').click();
  await expect(page.locator("[data-room-status]")).toHaveText("Disconnected.");
  await second.close();
});
test("unavailable experiments use clear error wording and allow retry", async ({
  page,
}) => {
  await page.route("**/api/edge", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await page.goto("/experiments/#at-the-edge");
  await page.locator('[data-live="edge"] > details > summary').click();
  await expect(page.locator("[data-edge-status]")).toHaveText(
    "This experiment is unavailable right now. Try again shortly.",
  );
  await expect(
    page.getByRole("button", { name: "Try connection again", exact: true }),
  ).toBeVisible();
});
