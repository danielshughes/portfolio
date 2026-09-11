import { expect, test } from "@playwright/test";

const browserExperiments = [
  {
    id: "kubernetes",
    title: "Room for one more?",
    subtitle:
      "Raise CPU demand and watch the replica target change, then see which pods fit.",
  },
  {
    id: "mcp",
    title: "Who’s allowed to do what?",
    subtitle:
      "Choose a scenario, set the call budget and decide whether a simulated write is allowed.",
  },
  {
    id: "wave",
    title: "A little interference.",
    subtitle: "Compare a clean wave with the same wave after interference is added.",
  },
  {
    id: "latency",
    title: "The average looks fine.",
    subtitle: "Keep most requests steady, then stretch the slowest ten.",
  },
  {
    id: "requests",
    title: "Requests in flight.",
    subtitle:
      "Change how many requests run together and see which finish before the deadline.",
  },
  {
    id: "world",
    title: "A small connected world.",
    subtitle: "Rotate the graph or select a node to see its direct connections.",
  },
] as const;

test("browser experiment titles and supporting copy are concrete", async ({
  page,
}) => {
  await page.goto("/experiments/");
  await expect(page.locator(".intro-description")).toContainText(
    "Small controls, visible consequences.",
  );
  await expect(page.locator(".intro-description")).toContainText(
    "Browser simulations are self-contained; live cards use bounded demo endpoints.",
  );
  for (const { id, title, subtitle } of browserExperiments) {
    const card = page.locator(`#${id}`);
    await expect(card.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(card.locator(".experiment-card-heading p")).toHaveText(subtitle);
  }
  await expect(page.locator("#kubernetes .experiment-settings summary")).toContainText(
    "Explore",
  );
  await page.locator("#mcp > .experiment-settings > summary").click();
  await expect(page.locator("#mcp .trace-list > summary")).toContainText(
    "Follow the trace",
  );
  await expect(page.locator("#mcp .experiment-desk")).toContainText(
    "Follow the scripted agent as it checks context, calls tools and stops at a timeout, missing context or denied write.",
  );
  await page.locator("#kubernetes > .experiment-settings > summary").click();
  await expect(page.locator("#kubernetes output")).toHaveText(
    "HPA sets the replica target. Placement uses each pod's CPU request, so a pod can stay pending when there is no room.",
  );
  await page.locator("#wave > .experiment-settings > summary").click();
  await expect(
    page.locator("#wave .experiment-desk > p:not(.experiment-footnote)"),
  ).toHaveText(
    "The upper trace stays clean. Change the lower trace's noise, frequency and amplitude.",
  );
  await page.locator("#latency > .experiment-settings > summary").click();
  await expect(
    page.locator("#latency .experiment-desk > p:not(.experiment-footnote)"),
  ).toHaveText(
    "Move the tail slider and watch the median stay put while the slow end grows.",
  );
  await page.locator("#requests > .experiment-settings > summary").click();
  await expect(page.locator("#requests output")).toHaveText(
    "The readout will show how many of 12 requests meet the deadline.",
  );
  await page.locator("#world > .experiment-settings > summary").click();
  await expect(page.locator("#world .connection-list > summary")).toContainText(
    "See the connections",
  );
  await expect(page.locator("#world .experiment-desk > p")).toHaveText(
    "Drag to rotate. Select a node to highlight its neighbours and dim the rest.",
  );
});

test("live experiment copy names the request and visible result", async ({
  page,
}) => {
  await page.goto("/experiments/");
  await expect(page.locator("#at-the-edge .live-intro")).toHaveText(
    "These cards make bounded requests to Cloudflare, then show exactly what comes back.",
  );
  const expected = [
    ["edge", "Your request, at the edge."],
    ["health", "A day of scheduled checks, including gaps."],
    ["stream", "Start a response and watch six chunks arrive."],
    ["room", "Connect two windows and send a numbered pulse between them."],
    [
      "triage",
      "Choose a fictional incident and get a hypothesis, two checks and the unknowns.",
    ],
  ] as const;
  for (const [id, subtitle] of expected)
    await expect(page.locator(`#${id} .experiment-card-heading p`)).toHaveText(
      subtitle,
    );
  await expect(page.locator("#edge .preview-caption")).toHaveText(
    "Illustration; open to inspect the metadata returned for this request",
  );
  await expect(page.locator("#health .preview-caption")).toHaveText(
    "Scheduled checks; open to inspect recorded response headers",
  );
  await expect(page.locator("#stream .preview-caption")).toHaveText(
    "Illustration; run it to receive six real chunks",
  );
  await expect(page.locator("#room .preview-caption")).toHaveText(
    "Shared sequence; connect to send a real pulse",
  );
  await expect(page.locator("#triage .triage-reference")).toContainText(
    "This is the authored baseline for comparison. The model sees only the selected facts and question.",
  );
});

test("Radar and AI scenario copy stays concrete and attributed", async ({
  page,
}) => {
  await page.goto("/experiments/#internet");
  const radar = page.locator("#internet");
  await expect(
    radar.locator(
      ".internet-heading > div > p:not(.eyebrow):not(.experiment-technology)",
    ),
  ).toHaveText("Pick a country and scrub through its observed week.");
  await expect(radar.locator("[data-radar-reading-label]")).toHaveText(
    "Observed traffic, normalised to 100",
  );
  const views = [
    [
      "Traffic",
      "Relative HTTP request volume across this country's observed week.",
      "Compare the line with itself: this country's peak is 100. A dip alone does not establish an outage.",
    ],
    [
      "Bots",
      "Share of HTTP requests likely to be automated.",
      "Likely automated does not mean malicious. This is not a count of AI agents.",
    ],
    [
      "Devices",
      "Share of requests by device type.",
      "Bars show request share, not unique people. Unclassified devices stay in Other.",
    ],
    [
      "Protocols",
      "Share of requests by HTTP version.",
      "Bars show request share. HTTP/3 uses QUIC; this chart does not measure speed or security.",
    ],
  ] as const;
  for (const [tab, description, guide] of views) {
    await radar.getByRole("tab", { name: tab, exact: true }).click();
    await expect(radar.locator("#radar-description")).toHaveText(description);
    await expect(radar.locator("[data-radar-guide]")).toHaveText(guide);
  }
  await expect(
    radar.getByRole("link", { name: /Cloudflare Radar/ }),
  ).toHaveAttribute("href", "https://radar.cloudflare.com/");
  const triage = page.locator("#triage");
  const scenarios = [
    "What could explain the slow requests, and what should be checked next?",
    "Why might telemetry be dropping while application health checks still pass?",
    "Why are four pods pending when node CPU usage is low? Explain placement, not why HPA chose eight.",
  ];
  for (const [index, question] of scenarios.entries()) {
    await triage.locator("#triage-scenario").selectOption(
      ["latency", "telemetry", "replicas"][index],
    );
    await expect(triage.locator("[data-triage-question]")).toHaveText(question);
  }
});
