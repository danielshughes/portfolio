import { radarTime } from "./radar-client";
import type { RadarSummary } from "./radar-summary";
import type { RadarView } from "./radar-views";
export type { RadarView } from "./radar-views";

export const radarViews = {
  traffic: {
    title: "Traffic",
    readingLabel: "Observed traffic, normalised to 100",
    description:
      "Relative HTTP request volume across this country's observed week.",
    guide:
      "Compare the line with itself: this country's peak is 100. A dip alone does not establish an outage.",
  },
  bots: {
    title: "Bots",
    readingLabel: "Observed automated share",
    description: "Share of HTTP requests likely to be automated.",
    guide:
      "Likely automated does not mean malicious. This is not a count of AI agents.",
  },
  devices: {
    title: "Devices",
    readingLabel: "Observed device share",
    description: "Share of requests by device type.",
    guide:
      "Bars show request share, not unique people. Unclassified devices stay in Other.",
  },
  protocols: {
    title: "Protocols",
    readingLabel: "Observed HTTP version share",
    description: "Share of requests by HTTP version.",
    guide:
      "Bars show request share. HTTP/3 uses QUIC; this chart does not measure speed or security.",
  },
} satisfies Record<
  RadarView,
  { title: string; readingLabel: string; description: string; guide: string }
>;
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
