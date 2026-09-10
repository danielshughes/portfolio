import { radarTime } from "./radar-client";

export const radarViews = {
  traffic: {
    title: "Traffic",
    description: "The daily rhythm of HTTP requests seen by Cloudflare.",
    guide:
      "Read the shape, not the size. Each country's peak is 100; a dip alone does not establish an outage.",
  },
  bots: {
    title: "Bots",
    description: "How much HTTP traffic looks automated?",
    guide:
      "Likely automated is not the same as malicious. This is not a count of AI agents.",
  },
  devices: {
    title: "Devices",
    description: "The devices behind the requests.",
    guide:
      "Bars show the share of requests, not unique people. Unknown devices remain in Other.",
  },
  protocols: {
    title: "Protocols",
    description: "Which HTTP versions carry the traffic?",
    guide:
      "Each bar is a share of requests. HTTP/3 uses QUIC; this chart does not measure speed or security.",
  },
};
export type RadarView = keyof typeof radarViews;
export interface RadarSummary {
  mode: "radar";
  country: string;
  view: string;
  categories: { label: string; value: number }[];
  window: { start: string; end: string };
  updatedAt: string;
  confidence: { level: number | null; annotationCount: number };
}
export function isRadarSummary(
  body: unknown,
  country: string,
  view: string,
): body is RadarSummary {
  if (!body || typeof body !== "object") return false;
  const b = body as RadarSummary;
  return (
    b.mode === "radar" &&
    b.country === country &&
    b.view === view &&
    !!b.window &&
    [b.window.start, b.window.end, b.updatedAt].every(
      (s) => typeof s === "string" && Number.isFinite(Date.parse(s)),
    ) &&
    !!b.confidence &&
    (b.confidence.level === null ||
      (typeof b.confidence.level === "number" &&
        b.confidence.level >= 0 &&
        b.confidence.level <= 5)) &&
    Number.isInteger(b.confidence.annotationCount) &&
    b.confidence.annotationCount >= 0 &&
    Array.isArray(b.categories) &&
    b.categories.length > 0 &&
    b.categories.length <= 12 &&
    b.categories.every(
      (c) =>
        c &&
        typeof c.label === "string" &&
        c.label.length <= 60 &&
        typeof c.value === "number" &&
        Number.isFinite(c.value) &&
        c.value >= 0 &&
        c.value <= 100,
    ) &&
    Math.abs(b.categories.reduce((sum, c) => sum + c.value, 0) - 100) < 0.11
  );
}
export function mountRadarTabs(
  root: HTMLElement,
  select: (view: RadarView) => void,
) {
  const tabs = [
    ...root.querySelectorAll<HTMLButtonElement>("[data-radar-view]"),
  ];
  const panel = root.querySelector<HTMLElement>("#radar-panel")!;
  function show(view: RadarView) {
    for (const tab of tabs) {
      const active = tab.dataset.radarView === view;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `radar-tab-${view}`);
    for (const [selector, hidden] of [
      [".radar-traffic", view !== "traffic"],
      [".radar-summary", view === "traffic"],
      [".internet-traffic-context", view !== "traffic"],
      [".internet-summary-context", view === "traffic"],
    ] as const) {
      const content = root.querySelector<HTMLElement>(selector)!;
      content.hidden = hidden;
      content.inert = hidden;
    }
    root.querySelector<HTMLElement>(".radar-description")!.textContent =
      radarViews[view].description;
    root.querySelector<HTMLElement>("[data-radar-guide]")!.textContent =
      radarViews[view].guide;
  }
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener("click", () => {
      const view = tab.dataset.radarView as RadarView;
      show(view);
      select(view);
    });
    tab.addEventListener("keydown", (event) => {
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index + tabs.length - 1) % tabs.length
                : -1;
      if (next < 0) return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  }
  show("traffic");
}
export function renderSummary(root: HTMLElement, data: RadarSummary) {
  const names: Record<string, string> = {
    human: "Likely human",
    bot: "Likely automated",
    desktop: "Desktop",
    mobile: "Mobile",
    other: "Other",
  };
  const bars = root.querySelector<HTMLElement>(".radar-bars")!;
  bars.replaceChildren(
    ...data.categories.map((category) => {
      const row = document.createElement("li"),
        label = document.createElement("span"),
        value = document.createElement("strong"),
        track = document.createElement("span"),
        fill = document.createElement("span");
      label.textContent = names[category.label] ?? category.label;
      value.textContent =
        category.value > 0 && category.value < 0.1
          ? "<0.1%"
          : `${Math.round(category.value * 10) / 10}%`;
      track.className = "radar-bar-track";
      track.setAttribute("aria-hidden", "true");
      fill.style.width = `${category.value}%`;
      track.append(fill);
      row.append(label, value, track);
      return row;
    }),
  );
  root.querySelector<HTMLElement>(".radar-summary-window")!.textContent =
    `${radarTime(data.window.start)} to ${radarTime(data.window.end)}. Share of observed HTTP requests.`;
}
