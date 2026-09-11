import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

test("live actions wait for their lazy module before becoming enabled", async ({
  page,
}) => {
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  let loading = false;
  await page.route("**/_astro/live.*.js", async (route) => {
    loading = true;
    await paused;
    await route.continue();
  });
  let requests = 0;
  await page.route("**/api/triage?*", (route) => {
    requests++;
    return route.fulfill({
      json: { answer: "A bounded synthetic response." },
    });
  });
  await page.goto("/experiments/#triage");
  await page.locator('[data-live="triage"] > details > summary').click();
  const run = page.getByRole("button", { name: "Run triage", exact: true });
  try {
    await expect.poll(() => loading).toBe(true);
    await expect(run).toBeDisabled();
    await expect(page.locator("#triage-scenario")).toBeDisabled();
    await expect(page.locator("[data-room-connect]")).toBeDisabled();
    expect(requests).toBe(0);
  } finally {
    release();
  }
  await expect(run).toBeEnabled();
  await expect(page.locator("#triage-scenario")).toBeEnabled();
  await expect(page.locator("[data-room-connect]")).toBeEnabled();
  await expect(page.locator("[data-room-send]")).toBeDisabled();
  await run.click();
  await expect(page.locator("[data-triage-answer]")).toHaveText(
    "A bounded synthetic response.",
  );
  expect(requests).toBe(1);
});

test("local services explain their limits without claiming observed edge metadata", async ({
  page,
}) => {
  await page.route("**/api/edge", (route) =>
    route.fulfill({
      json: {
        mode: "local",
        country: null,
        colo: null,
        protocol: null,
        tls: null,
        roundTripMs: null,
        network: null,
      },
    }),
  );
  await page.route("**/api/triage?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "local_inference_unavailable" },
    }),
  );
  await page.goto("/experiments/#at-the-edge");
  await page.locator('[data-live="edge"] > details > summary').click();
  await expect(page.locator("[data-edge-status]")).toHaveText(
    "Local preview. Connection metadata is available on the deployed site.",
  );
  await expect(page.locator("[data-edge-colo]")).toHaveText("Not supplied");
  await expect(page.locator('[data-live="edge"] .live-footnote')).toHaveText(
    "Country is approximate. Your IP address isn’t returned to this page.",
  );
  await page.locator('[data-live="triage"] > details > summary').click();
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.locator("[data-triage-status]")).toHaveText(
    "Workers AI needs a Cloudflare connection. Local preview does not run inference; try this on the deployed development site.",
  );
  await expect(page.locator("[data-triage-answer]")).toBeHidden();
});

test("changing a pending AI scenario keeps the new scenario ready", async ({
  page,
}) => {
  let requested!: () => void;
  const pending = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/triage?*", () => {
    requested();
  });
  await page.goto("/experiments/#triage");
  await page.locator('[data-live="triage"] > details > summary').click();
  const run = page.getByRole("button", { name: "Run triage", exact: true });
  await run.click();
  await pending;
  await page.locator("#triage-scenario").selectOption("telemetry");
  await expect(run).toBeEnabled();
  await expect(page.locator("[data-triage-status]")).toHaveText(
    "Ready. No model request until you press Run.",
  );
});

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
  await page.route("**/api/edge", (route) =>
    route.fulfill({
      json: {
        mode: "observed",
        country: "GB",
        colo: "LHR",
        protocol: "HTTP/3",
        tls: "TLSv1.3",
        roundTripMs: 60000,
        network: "LongNetworkName".repeat(8),
      },
    }),
  );
  await page.route("**/api/triage?*", (route) =>
    route.fulfill({ json: { answer: "BoundedModelOutput".repeat(100) } }),
  );
  await page.goto("/experiments/#at-the-edge");
  for (const id of ["edge", "health", "triage", "room"])
    await page.locator(`[data-live="${id}"] > details > summary`).click();
  await page.getByRole("button", { name: "Run triage", exact: true }).click();
  await expect(page.locator("[data-triage-answer]")).toBeVisible();
  await expect(page.locator("[data-edge-network]")).toContainText(
    "LongNetworkName",
  );
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

test("health keeps missing intervals distinct from failures and dates its snapshot", async ({
  page,
}) => {
  const start = Date.UTC(2026, 8, 10);
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        window: {
          start: new Date(start).toISOString(),
          end: new Date(start + 86400000).toISOString(),
        },
        samples: [
          { observed_at: start + 300000, status: 200, elapsed_ms: 25, ok: 1 },
          { observed_at: start + 600000, status: 200, elapsed_ms: 40, ok: 1 },
          { observed_at: start + 1200000, status: 200, elapsed_ms: 32, ok: 1 },
          {
            observed_at: start + 1500000,
            status: 503,
            elapsed_ms: 4000,
            ok: 0,
          },
        ],
      },
    }),
  );
  await page.goto("/experiments/#health");
  const card = page.locator('[data-live="health"]');
  await card.locator(".experiment-settings > summary").click();
  await expect(card.locator("[data-health-points] circle")).toHaveCount(3);
  await expect(card.locator("[data-health-failures] path")).toHaveCount(1);
  const path = await card.locator("[data-health-line]").getAttribute("d");
  expect(path?.match(/M/g)).toHaveLength(2);
  expect(path?.match(/L/g)).toHaveLength(1);
  await expect(card.locator("[data-health-window]")).toContainText(
    /10 Sept? 2026/,
  );
  await expect(card.locator("[data-health-status]")).toContainText(
    "4 of 288 scheduled samples in this window. 3 returned HTTP 200",
  );
  await card.getByText("Recent readings", { exact: true }).click();
  await expect(card.locator("tbody tr")).toHaveCount(4);
  await expect(card.locator("tbody tr").first()).toContainText("503");
});

test("health refuses out-of-window or out-of-order readings instead of drawing them", async ({
  page,
}) => {
  const start = Date.UTC(2026, 8, 10);
  for (const times of [[start - 1], [start + 600000, start + 300000]]) {
    await page.route("**/api/health", (route) =>
      route.fulfill({
        json: {
          window: {
            start: new Date(start).toISOString(),
            end: new Date(start + 86400000).toISOString(),
          },
          samples: times.map((observed_at) => ({
            observed_at,
            status: 200,
            elapsed_ms: 20,
            ok: 1,
          })),
        },
      }),
    );
    await page.goto("/experiments/#health");
    await page.locator('[data-live="health"] > details > summary').click();
    await expect(page.locator("[data-health-status]")).toHaveText(
      "This experiment is unavailable right now. Try again shortly.",
    );
    await expect(page.locator("[data-health-points] circle")).toHaveCount(0);
    await page.unroute("**/api/health");
  }
});
test("real shared state synchronises two clients and disconnects when closed", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/experiments/#at-the-edge");
  const second = await context.newPage();
  await second.goto("/experiments/#at-the-edge");
  for (const p of [page, second]) {
    await p.locator('[data-live="room"] > details > summary').click();
    await p.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(p.locator("[data-room-status]")).toHaveText(
      "Connected. Send a pulse, or open this experiment in another visible window.",
    );
    await expect(p.locator("[data-room-sequence]")).toHaveText(/\d+/);
    await expect(p.locator(".room-pulse")).toHaveCSS("opacity", "0");
  }
  await page.getByRole("button", { name: "Send pulse", exact: true }).click();
  await expect
    .poll(() =>
      page.locator(".room-pulse").evaluate((node) => {
        const effect = node.getAnimations()[0]?.effect as
          KeyframeEffect | undefined;
        return effect
          ?.getKeyframes()
          .map((frame) => frame.transform)
          .filter(Boolean);
      }),
    )
    .toEqual([
      "translateX(-210px)",
      "translateX(-210px)",
      "translateX(0px)",
      "translateX(0px)",
      "translateX(210px)",
      "translateX(210px)",
    ]);
  await expect
    .poll(() =>
      page
        .locator(".room-arrival")
        .evaluate((node) => node.getAnimations().length),
    )
    .toBe(1);
  const travel = await page.locator(".room-pulse").evaluate((node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    const svg = node.closest("svg")!;
    const centres = [80, 500, 920].map((time) => {
      animation.currentTime = time;
      const rect = node.getBoundingClientRect();
      return rect.x + rect.width / 2;
    });
    animation.currentTime = 500;
    const pulse = node.getBoundingClientRect();
    const labels = Array.from(svg.querySelectorAll("text")).filter((label) =>
      ["shared", "sequence"].includes(label.textContent?.trim() ?? ""),
    );
    const labelOverlap = labels.some((label) => {
      const rect = label.getBoundingClientRect();
      return pulse.top < rect.bottom && pulse.bottom > rect.top;
    });
    const endpoints = Array.from(svg.querySelectorAll("circle.preview-node"))
      .map((circle) => circle.getBoundingClientRect())
      .map((rect) => rect.x + rect.width / 2);
    animation.play();
    return { centres, endpoints, labelOverlap };
  });
  expect(travel.centres[0]).toBeCloseTo(travel.endpoints[0], 0);
  expect(travel.centres[2]).toBeCloseTo(travel.endpoints[1], 0);
  expect(travel.centres[1]).toBeCloseTo(
    (travel.endpoints[0] + travel.endpoints[1]) / 2,
    0,
  );
  expect(travel.labelOverlap).toBe(false);
  for (const p of [page, second])
    await expect(p.locator("[data-room-sequence]")).toHaveText(/\d+/);
  await expect(page.locator("[data-room-sequence]")).toHaveText(
    await second.locator("[data-room-sequence]").innerText(),
  );
  await page.locator('[data-live="room"] > details > summary').click();
  await expect(page.locator("[data-room-status]")).toHaveText("Disconnected.");
  await expect(page.locator("[data-room-sequence]")).toHaveText(
    "Not connected",
  );
  await second.close();
});

test("a visible Connect action does not wait for an intersection notification", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeObserver = window.IntersectionObserver;
    window.IntersectionObserver = class extends NativeObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super((entries, observer) => {
          if (
            entries.some((entry) => entry.target.matches('[data-live="room"]'))
          )
            return;
          callback(entries, observer);
        }, options);
      }
    };
  });
  await page.goto("/experiments/#room");
  await page.locator('[data-live="room"] > details > summary').click();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("[data-room-sequence]")).toHaveText(/\d+/);
});

test("room state stays live while its offscreen diagram does no animation", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 402, height: 500 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const second = await context.newPage();
  for (const p of [page, second]) {
    await p.goto("/experiments/#room");
    await p.locator('[data-live="room"] > details > summary').click();
    await p.getByRole("button", { name: "Connect", exact: true }).click();
    await expect(p.locator("[data-room-sequence]")).toHaveText(/\d+/);
  }
  await page
    .locator("[data-room-send]")
    .evaluate((button) =>
      button.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await expect
    .poll(() =>
      page
        .locator('[data-live="room"] .experiment-stage')
        .evaluate((stage) => stage.getBoundingClientRect().bottom),
    )
    .toBeLessThanOrEqual(0);
  const before = await page.locator("[data-room-sequence]").innerText();
  await second.getByRole("button", { name: "Send pulse", exact: true }).click();
  await expect(page.locator("[data-room-sequence]")).not.toHaveText(before);
  for (const selector of [".room-pulse", ".room-arrival"])
    expect(
      await page
        .locator(selector)
        .evaluate((node) => node.getAnimations().length),
    ).toBe(0);
  await second.close();
});
test("a non-JSON rate limit still explains why an experiment is unavailable", async ({
  page,
}) => {
  await page.route("**/api/edge", (route) =>
    route.fulfill({
      status: 429,
      contentType: "text/html",
      body: "Request limit reached",
    }),
  );
  await page.goto("/experiments/#at-the-edge");
  await page.locator('[data-live="edge"] > details > summary').click();
  await expect(page.locator("[data-edge-status]")).toHaveText(
    "This experiment has reached its request limit. Try again later.",
  );
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
