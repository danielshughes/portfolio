import { expect, test, type Page } from "@playwright/test";

const phrases = [
  "Hands-on leadership. Shared know-how.",
  "Observability beyond the dashboard.",
  "Kubernetes, from config to rollout.",
  "AI tooling with guardrails built in.",
  "Incident lessons turned into code.",
  "Infrastructure as code, reviewed in Git.",
  "Automate the repeatable. Investigate the rest.",
];

async function openSubtitle(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await page.goto("/");
  const subtitle = page.locator(".terminal-subtitle");
  await expect(subtitle).toBeVisible();
  await subtitle.scrollIntoViewIfNeeded();
  await expect(subtitle).toHaveAttribute("data-motion", /running|holding/);
  return subtitle;
}

async function setHidden(page: Page, hidden: boolean) {
  // Exercise the platform visibility event; the application has no test hooks.
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => value,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function advanceUntilText(
  page: Page,
  read: () => Promise<string | null>,
  predicate: (text: string) => boolean,
  limit = 7000,
) {
  for (let elapsed = 0; elapsed <= limit; elapsed += 20) {
    const text = (await read()) ?? "";
    if (predicate(text)) return text;
    await page.clock.runFor(20);
  }
  throw new Error(
    `subtitle did not reach the expected state within ${limit}ms`,
  );
}

test("subtitle beneath the main heading repeatedly deletes and types different approved phrases", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  const subtitle = await openSubtitle(page);
  const letters = subtitle.locator(".subtitle-letters");
  await expect(letters).toHaveText(phrases[0]);
  expect
    .soft(await page.locator("#page-title + .terminal-subtitle").count())
    .toBe(1);
  await page.evaluate(() => {
    const letters = document.querySelector(".subtitle-letters")!;
    const samples: string[] = [];
    new MutationObserver(() => samples.push(letters.textContent || "")).observe(
      letters,
      { childList: true, characterData: true, subtree: true },
    );
    Object.assign(window, { subtitleSamples: samples });
  });
  await page.clock.runFor(12000);
  await expect(letters).toHaveText(phrases[5]);
  const samples = await page.evaluate(
    () => (window as unknown as { subtitleSamples: string[] }).subtitleSamples,
  );
  expect(samples).toContain(phrases[0].slice(0, -1));
  expect(samples).toContain("");
  expect(samples).toContain(phrases[6].slice(0, 1));
  expect(samples).toContain(phrases[6].slice(0, -1));
  expect(samples.filter((text) => phrases.includes(text))).toEqual([
    phrases[6],
    phrases[5],
  ]);
  await expect(subtitle).toHaveAttribute("data-motion", "holding");
  expect(
    await subtitle
      .locator(".subtitle-live .subtitle-caret")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).not.toBe("none");
  await expect(subtitle.getByRole("button")).toHaveCount(0);
  await page.clock.runFor(6000);
  const complete = await page.evaluate(
    (approved) =>
      (
        window as unknown as { subtitleSamples: string[] }
      ).subtitleSamples.filter((text) => approved.includes(text)),
    phrases,
  );
  expect(complete.length).toBeGreaterThan(2);
  complete.forEach((text, index) => {
    if (index > 0) expect(text).not.toBe(complete[index - 1]);
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Observability, SRE & AI Leader",
  );
  await expect(
    subtitle.getByRole("heading", { level: 2 }),
  ).toHaveAccessibleName(phrases[0]);
  await expect(subtitle.locator("[aria-live], [role='status']")).toHaveCount(0);
  await expect(subtitle.locator(".subtitle-live")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

test("random selection can choose a different approved target", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  const subtitle = await openSubtitle(page);
  await page.clock.runFor(6000);
  await expect(subtitle.locator(".subtitle-letters")).toHaveText(phrases[1]);
});

test("subtitle visits the whole phrase set before reuse", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  const subtitle = await openSubtitle(page);
  const box = (await subtitle.boundingBox())!;
  // Keep the subtitle visible without running the unrelated network animation.
  await page.setViewportSize({
    width: 1440,
    height: Math.ceil(box.y + box.height + 1),
  });
  await expect(page.locator(".connection-field")).toHaveAttribute(
    "data-motion",
    "idle",
  );
  await page.evaluate(() => {
    const letters = document.querySelector(".subtitle-letters")!;
    const samples: string[] = [letters.textContent || ""];
    Object.assign(window, { phraseCycleSamples: samples });
    new MutationObserver(() => samples.push(letters.textContent || "")).observe(
      letters,
      { childList: true },
    );
  });
  await page.clock.runFor(42000);
  const complete = await page.evaluate(
    (approved) =>
      (
        window as unknown as { phraseCycleSamples: string[] }
      ).phraseCycleSamples.filter((text) => approved.includes(text)),
    phrases,
  );
  expect(complete.length).toBeGreaterThan(phrases.length);
  expect(new Set(complete.slice(0, phrases.length)).size).toBe(phrases.length);
  for (let index = 1; index < complete.length; index++)
    expect(complete[index]).not.toBe(complete[index - 1]);
});

for (const [width, textSize] of [
  [390, "100%"],
  [1440, "100%"],
  [320, "200%"],
] as const) {
  test(`subtitle reserves every phrase at ${width}px with ${textSize} text`, async ({
    page,
  }) => {
    await openSubtitle(page);
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, textSize);
    await page.evaluate(() => document.fonts.ready);
    const subtitle = page.locator(".terminal-subtitle");
    await subtitle.scrollIntoViewIfNeeded();
    const initial = (await subtitle.boundingBox())!;
    const paragraph = page.locator(".opening-copy > p");
    const paragraphBefore = (await paragraph.boundingBox())!;
    const live = subtitle.locator(".subtitle-live");
    for (let elapsed = 0; elapsed < 12000; elapsed += 300) {
      const bounds = (await subtitle.boundingBox())!;
      const text = (await live.boundingBox())!;
      expect.soft(bounds.height).toBeCloseTo(initial.height, 1);
      expect.soft(bounds.width).toBeCloseTo(initial.width, 1);
      expect
        .soft((await paragraph.boundingBox())!.y)
        .toBeCloseTo(paragraphBefore.y, 1);
      expect.soft(text.x).toBeGreaterThanOrEqual(bounds.x - 1);
      expect
        .soft(text.x + text.width)
        .toBeLessThanOrEqual(bounds.x + bounds.width + 1);
      expect
        .soft(text.y + text.height)
        .toBeLessThanOrEqual(bounds.y + bounds.height + 1);
      await page.clock.runFor(300);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}

test("no JavaScript leaves the complete opening subtitle visible", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const subtitle = page.locator(".terminal-subtitle");
  await expect(subtitle.locator(".subtitle-letters")).toHaveText(phrases[0]);
  await expect(subtitle.locator(".subtitle-letters")).toBeVisible();
  await expect(
    subtitle.getByRole("heading", { level: 2 }),
  ).toHaveAccessibleName(phrases[0]);
  await expect(subtitle.locator(".subtitle-live .subtitle-caret")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(subtitle.getByRole("button")).toHaveCount(0);
  await context.close();
});

test("reduced motion is complete and still at load and when changed live", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/");
  const subtitle = page.locator(".terminal-subtitle");
  const letters = subtitle.locator(".subtitle-letters");
  await expect(letters).toHaveText(phrases[0]);
  await page.clock.runFor(10000);
  await expect(letters).toHaveText(phrases[0]);
  await expect(subtitle.locator(".subtitle-live .subtitle-caret")).toHaveCSS(
    "animation-name",
    "none",
  );

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await subtitle.scrollIntoViewIfNeeded();
  await expect(subtitle).toHaveAttribute("data-motion", "holding");
  await page.clock.runFor(3300);
  await expect(letters).not.toHaveText(phrases[0]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(letters).toHaveText(phrases[0]);
  await expect(subtitle).not.toHaveAttribute("data-motion", "running");
  await page.clock.runFor(10000);
  await expect(letters).toHaveText(phrases[0]);
});

test("offscreen subtitle suspends typing and caret, then resumes without catching up", async ({
  page,
}) => {
  const subtitle = await openSubtitle(page);
  const letters = subtitle.locator(".subtitle-letters");
  await page.clock.runFor(3300);
  await expect(subtitle).toHaveAttribute("data-motion", "running");
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await expect(subtitle).not.toHaveAttribute("data-motion", "running");
  const paused = await letters.textContent();
  await expect(subtitle.locator(".subtitle-live .subtitle-caret")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.clock.runFor(30000);
  await expect(letters).toHaveText(paused!);
  await subtitle.scrollIntoViewIfNeeded();
  await expect(subtitle).toHaveAttribute("data-motion", "running");
  const resumed = await advanceUntilText(
    page,
    () => letters.textContent(),
    (text) =>
      text.length > 0 && phrases.some((phrase) => phrase.startsWith(text)),
  );
  expect(phrases.some((phrase) => phrase.startsWith(resumed))).toBe(true);
  const completed = await advanceUntilText(
    page,
    () => letters.textContent(),
    (text) => phrases.slice(1).includes(text),
  );
  expect(phrases.slice(1)).toContain(completed);
});

test("hidden document suspends typing and caret, then resumes without catching up", async ({
  page,
}) => {
  const subtitle = await openSubtitle(page);
  const letters = subtitle.locator(".subtitle-letters");
  await page.clock.runFor(3300);
  await expect(subtitle).toHaveAttribute("data-motion", "running");
  await setHidden(page, true);
  const paused = await letters.textContent();
  await expect(subtitle).not.toHaveAttribute("data-motion", "running");
  await expect(subtitle.locator(".subtitle-live .subtitle-caret")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.clock.runFor(30000);
  await expect(letters).toHaveText(paused!);
  await setHidden(page, false);
  const resumed = await advanceUntilText(
    page,
    () => letters.textContent(),
    (text) =>
      text.length > 0 && phrases.some((phrase) => phrase.startsWith(text)),
  );
  expect(phrases.some((phrase) => phrase.startsWith(resumed))).toBe(true);
  const completed = await advanceUntilText(
    page,
    () => letters.textContent(),
    (text) => phrases.slice(1).includes(text),
  );
  expect(phrases.slice(1)).toContain(completed);
});

test("queued subtitle callback checks hidden state before its visibility event arrives", async ({
  page,
}) => {
  const subtitle = await openSubtitle(page);
  const letters = subtitle.locator(".subtitle-letters");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
  });
  await page.clock.runFor(5000);
  await expect(letters).toHaveText(phrases[0]);
  await expect(subtitle).toHaveAttribute("data-motion", "paused");
  await setHidden(page, false);
  await page.clock.runFor(100);
  const resumed = (await letters.textContent())!;
  expect(resumed.length).toBeLessThan(phrases[0].length);
  expect(resumed.length).toBeGreaterThan(0);
  expect(phrases[0].startsWith(resumed)).toBe(true);
});

test("queued subtitle callback checks native reduced motion before its change event arrives", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = nativeMatchMedia(query);
      if (query === "(prefers-reduced-motion: reduce)") {
        // Preserve the browser's live matches value while withholding delivery.
        media.addEventListener = () => undefined;
      }
      return media;
    };
  });
  const subtitle = await openSubtitle(page);
  await page.evaluate(() => {
    const writes: string[] = [];
    Object.assign(window, { queuedSubtitleWrites: writes });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes)
          writes.push(node.textContent || "");
      }
    }).observe(document.querySelector(".subtitle-letters")!, {
      childList: true,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.runFor(5000);
  const writes = await page.evaluate(
    () =>
      (window as unknown as { queuedSubtitleWrites: string[] })
        .queuedSubtitleWrites,
  );
  expect(writes.length).toBeGreaterThan(0);
  expect(writes.every((text) => text === phrases[0])).toBe(true);
  await expect(subtitle.locator(".subtitle-letters")).toHaveText(phrases[0]);
  await expect(subtitle).toHaveAttribute("data-motion", "static");
});

for (const width of [390, 1440]) {
  test(`subtitle keeps a compact gap above the hero border at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const subtitle = (await page.locator(".terminal-subtitle").boundingBox())!;
    const hero = (await page.locator(".hero-bottom").boundingBox())!;
    const gap = hero.y - (subtitle.y + subtitle.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(width <= 720 ? 8 : 16);
  });
}
