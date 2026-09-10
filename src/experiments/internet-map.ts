import { countries, pointAt, eventsAt, chartPath } from "./internet-model";
import { createRadarCache, RadarBackoffError } from "./radar-cache";
import {
  isRadarData,
  radarTime,
  radarMetadata,
  type RadarData,
} from "./radar-client";
import {
  mountRadarTabs,
  renderSummary,
  radarViews,
  type RadarView,
} from "./radar-tabs";
import { isRadarSummary, type RadarSummary } from "./radar-summary";

export function mountInternetMap(root: HTMLElement) {
  const query = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;
  const time = query<HTMLInputElement>("#internet-time");
  const play = query<HTMLButtonElement>("[data-internet-play]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let week: {
    values: (number | null)[];
    events: { start: number; end: number; description: string }[];
  } = { values: Array(168).fill(null), events: [] };
  let code = "GB",
    playing = false,
    frame = 0;
  let start = 0,
    startHour = 0;
  const announcement = query<HTMLElement>(".internet-announcement");
  const liveButton = query<HTMLButtonElement>("[data-internet-live]");
  let mapVisible = false;
  let pointerExploring = false,
    focusExploring = false;
  const connection = (
    navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  const cache = createRadarCache<RadarData | RadarSummary>(
    async (key, signal) => {
      const [country, requestedView] = key.split(":");
      const response = await fetch(
        `/api/radar?country=${encodeURIComponent(country)}${requestedView === "traffic" ? "" : `&view=${requestedView}`}`,
        { signal, credentials: "same-origin" },
      );
      if (response.status === 429 || response.status === 503)
        throw new RadarBackoffError("Radar backing off");
      if (!response.ok) throw new Error("Radar unavailable");
      const body: unknown = await response.json();
      if (
        requestedView === "traffic"
          ? isRadarData(body, country)
          : isRadarSummary(body, country, requestedView)
      )
        return body as RadarData | RadarSummary;
      throw new Error("Invalid Radar response");
    },
  );
  function syncPrefetch() {
    cache.setExploring(
      mapVisible &&
        !document.hidden &&
        (pointerExploring || focusExploring) &&
        !connection?.saveData &&
        !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? ""),
    );
  }
  function neighbours(intent?: string) {
    syncPrefetch();
    cache.prefetch([
      ...(intent ? [intent] : []),
      ...countries
        .filter((country) => country.code !== code)
        .map((country) => `${country.code}:${view}`),
      ...Object.keys(radarViews)
        .filter((next) => next !== view)
        .map((next) => `${code}:${next}`),
    ]);
  }
  root.addEventListener("pointerenter", () => {
    pointerExploring = true;
    neighbours();
  });
  root.addEventListener("pointerleave", () => {
    pointerExploring = false;
    syncPrefetch();
  });
  root.addEventListener("focusin", (event) => {
    focusExploring = true;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const country =
      target?.dataset.country ?? target?.dataset.mapCountry ?? code;
    neighbours(`${country}:${target?.dataset.radarView ?? view}`);
  });
  root.addEventListener("focusout", (event) => {
    focusExploring =
      event.relatedTarget instanceof Node && root.contains(event.relatedTarget);
    syncPrefetch();
  });
  connection?.addEventListener("change", syncPrefetch);
  document.addEventListener("visibilitychange", syncPrefetch);
  function syncPulse() {
    root.dataset.pulse =
      mapVisible && !document.hidden && !reduced.matches ? "running" : "paused";
  }
  reduced.addEventListener("change", syncPulse);
  document.addEventListener("visibilitychange", syncPulse);
  new IntersectionObserver((entries) => {
    mapVisible = entries[0].isIntersecting;
    syncPulse();
    syncPrefetch();
    if (mapVisible) neighbours();
  }).observe(query(".internet-atlas"));
  let loading = false;
  let data: RadarData | null = null;
  let selectedEvent: RadarData["outages"][number] | null = null;
  let detailEvent: object | null = null;
  let requestVersion = 0;
  let view: RadarView = "traffic";

  for (const element of root.querySelectorAll<HTMLElement>("[hidden]"))
    element.hidden = false;
  query(".internet-event-list").replaceChildren();
  mountRadarTabs(root, (next) => {
    view = next;
    stop();
    void loadRadar();
    neighbours();
  });

  function paint(announce = false) {
    const hour = Number(time.value);
    const value = pointAt(week.values, hour);
    const stamp = data
      ? radarTime(data.timestamps[hour])
      : "No observed reading";
    const event = eventsAt(week.events, hour)[0];
    const eventText = selectedEvent
      ? `Selected disruption: ${selectedEvent.description} (scope: ${selectedEvent.scope}). ${radarTime(selectedEvent.start)} to ${selectedEvent.end ? radarTime(selectedEvent.end) : "end not reported"}. Nearest hourly sample to its start: ${stamp}. Hourly traffic does not measure the precise disruption interval.`
      : (event?.description ??
        (data
          ? "No reported disruption at this time."
          : "Observed data is unavailable."));
    const reading = query(".internet-value");
    reading.toggleAttribute("data-placeholder", !data);
    reading.textContent = data
      ? value === null
        ? "N/A"
        : String(Math.round(value * 10) / 10)
      : loading
        ? "Loading"
        : "Unavailable";
    query(".internet-timestamp").textContent = stamp;
    query(".internet-event-status").textContent = eventText;
    query(".internet-event-caption").textContent = selectedEvent
      ? "Selected disruption. Details below."
      : event
        ? "Reported disruption at this time."
        : data
          ? "No reported disruption at this time."
          : "Observed data is unavailable.";
    const eventDetails = query<HTMLDetailsElement>(".internet-event-details");
    const nextDetailEvent = selectedEvent ?? event ?? null;
    eventDetails.hidden = !nextDetailEvent;
    // Preserve the reader's disclosure choice while this event stays selected.
    if (nextDetailEvent !== detailEvent) {
      eventDetails.open = !!selectedEvent;
      detailEvent = nextDetailEvent;
    }
    query(".internet-chart-cursor").setAttribute(
      "d",
      `M${(hour / 167) * 640} 0V160`,
    );
    time.setAttribute(
      "aria-valuetext",
      `${stamp}, ${value === null ? "missing data" : `observed traffic index ${value}`}${selectedEvent || event ? `, ${eventText}` : ""}`,
    );
    root.dataset.event = selectedEvent || event ? "disruption" : "none";
    if (announce)
      announcement.textContent = `${countries.find((country) => country.code === code)!.name}. ${time.getAttribute("aria-valuetext")}.`;
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(frame);
    play.disabled = reduced.matches || !data || loading;
    play.textContent = reduced.matches
      ? "Reduced motion on"
      : Number(time.value) === 167
        ? "Replay week"
        : "Play week";
    root.dataset.motion = "paused";
  }

  function selectCountry(next: string) {
    stop();
    code = next;
    const index = countries.findIndex((country) => country.code === code);
    query(".internet-country-name").textContent = countries[index].name;
    query(".internet-country-code").textContent = code;
    query(".internet-map-top span:last-child").textContent =
      `${String(index + 1).padStart(2, "0")} / ${String(countries.length).padStart(2, "0")}`;
    query(".internet-chart-line").setAttribute("d", chartPath(week.values));
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-country]",
    ))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.country === code),
      );
    for (const pin of root.querySelectorAll<SVGElement>("[data-country-pin]"))
      pin.classList.toggle("is-selected", pin.dataset.countryPin === code);
    void loadRadar();
    neighbours();
  }

  async function loadRadar() {
    selectedEvent = null;
    loading = true;
    data = null;
    stop();
    const version = ++requestVersion;
    const requestedCountry = code;
    const requestedView = view;
    week = { values: Array(168).fill(null), events: [] };
    time.value = "0";
    time.disabled = true;
    liveButton.disabled = true;
    liveButton.hidden = true;
    query(".internet-source").textContent = "Loading Cloudflare Radar";
    query(".internet-connection").textContent =
      `Fetching ${radarViews[view].title.toLowerCase()} for ${countries.find((c) => c.code === code)!.name}.`;
    announcement.textContent = query(".internet-connection").textContent;
    root.setAttribute("aria-busy", "true");
    query(".radar-bars").replaceChildren();
    query(".radar-summary-window").textContent = "Loading the observed week…";
    query("[data-radar-reading-label]").textContent =
      view === "traffic"
        ? "Observed / traffic index"
        : `Observed / ${radarViews[view].title.toLowerCase()}`;
    query("label[for=internet-time]").textContent = "Time in observed week";
    query("#internet-time-help").textContent =
      "Peak traffic in this country's week = 100. Gaps are missing readings.";
    query(".internet-chart-line").setAttribute("d", "");
    query<SVGElement>(".internet-event-band").style.display = "none";
    query<HTMLElement>(".internet-event-list").style.visibility = "hidden";
    query<HTMLElement>(".internet-event-list").inert = true;
    query(".internet-week-labels").textContent = "Observed week · hourly · UTC";
    query(".internet-disclaimer").textContent =
      "Relative traffic, not uptime or absolute country volumes. No reported events does not mean no outages.";
    paint();
    try {
      const body = await cache.get(`${requestedCountry}:${requestedView}`);
      if (version !== requestVersion) return;
      if (requestedView !== "traffic") {
        if (!isRadarSummary(body, requestedCountry, requestedView))
          throw new Error("Invalid Radar summary");
        renderSummary(root, body);
        query(".internet-source").textContent =
          "Cloudflare Radar · observed data";
        query(".internet-connection").textContent = radarMetadata(body);
        announcement.textContent = `${countries.find((c) => c.code === code)!.name}. ${radarViews[view].title} loaded.`;
        return;
      }
      if (!isRadarData(body, code)) throw new Error("Invalid Radar response");
      data = body;
      const first = Date.parse(data.window.start);
      week = {
        values: data.values,
        events: data.outages.map((event) => ({
          start: Math.max(0, (Date.parse(event.start) - first) / 3600000),
          end:
            event.end === null
              ? 168
              : (Date.parse(event.end) - first) / 3600000,
          description: `${event.description} (scope: ${event.scope})`,
        })),
      };
      query(".internet-source").textContent =
        "Cloudflare Radar · observed data";
      query(".internet-connection").textContent = radarMetadata(data);
      query(".internet-chart-line").setAttribute("d", chartPath(data.values));
      const captions = query(".internet-week-labels");
      captions.replaceChildren(
        ...[
          radarTime(data.timestamps[0]),
          "Hourly · UTC",
          radarTime(data.timestamps[167]),
        ].map((label) => {
          const span = document.createElement("span");
          span.textContent = label;
          return span;
        }),
      );
      const list = query<HTMLElement>(".internet-event-list"),
        heading = document.createElement("h3");
      list.style.visibility = "";
      list.inert = false;
      heading.textContent = "Reported disruptions";
      list.replaceChildren(heading);
      if (!data.outages.length) {
        const p = document.createElement("p");
        p.textContent =
          "No reported events returned for this country and week.";
        list.append(p);
      }
      data.outages.forEach((event, i) => {
        const p = document.createElement("p"),
          button = document.createElement("button");
        p.textContent = `${event.description} · Scope: ${event.scope}. ${radarTime(event.start)} to ${event.end ? radarTime(event.end) : "end not reported"}.`;
        button.type = "button";
        button.textContent = `View disruption ${i + 1}`;
        button.addEventListener("click", () => {
          stop();
          selectedEvent = event;
          const eventStart = Date.parse(event.start);
          const nearest = data!.timestamps.reduce(
            (best, stamp, index, stamps) =>
              Math.abs(Date.parse(stamp) - eventStart) <
              Math.abs(Date.parse(stamps[best]) - eventStart)
                ? index
                : best,
            0,
          );
          time.value = String(nearest);
          paint(true);
          query<HTMLDetailsElement>(".internet-event-details").open = true;
          time.focus({ preventScroll: true });
        });
        list.append(p, button);
      });
      if (data.outagesTruncated) {
        const p = document.createElement("p");
        p.textContent =
          "The source result reached the event limit; this list may be incomplete.";
        list.append(p);
      }
      time.disabled = false;
      paint(true);
    } catch {
      if (version !== requestVersion) return;
      query(".internet-source").textContent = "Radar data unavailable";
      query(".internet-connection").textContent =
        "The observed data could not be loaded. No sample readings have been substituted.";
      liveButton.hidden = false;
      announcement.textContent = "Radar data unavailable. Retry when ready.";
      query(".radar-summary-window").textContent =
        "Observed data is unavailable. Retry when ready.";
    } finally {
      if (version === requestVersion) {
        loading = false;
        if (!data && view === "traffic") paint();
        root.setAttribute("aria-busy", "false");
        liveButton.disabled = false;
        stop();
      }
    }
  }
  liveButton.addEventListener("click", () => {
    void loadRadar();
  });

  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-country], [data-map-country]",
  )) {
    const intent = () =>
      neighbours(
        `${button.dataset.country ?? button.dataset.mapCountry!}:${view}`,
      );
    button.addEventListener("pointerenter", intent);
    button.addEventListener("focus", intent);
    button.addEventListener("click", () =>
      selectCountry(button.dataset.country ?? button.dataset.mapCountry!),
    );
  }
  for (const tab of root.querySelectorAll<HTMLButtonElement>(
    "[data-radar-view]",
  )) {
    const intent = () => neighbours(`${code}:${tab.dataset.radarView}`);
    tab.addEventListener("pointerenter", intent);
    tab.addEventListener("focus", intent);
  }
  time.addEventListener("input", () => {
    stop();
    selectedEvent = null;
    paint();
  });
  query("[data-internet-reset]").addEventListener("click", () => {
    time.value = "0";
    selectCountry("GB");
  });

  function tick(now: number) {
    if (!playing) return;
    // Check at the point of motion as well as reacting to media-change events.
    if (reduced.matches) {
      stop();
      return;
    }
    if (!start) start = now;
    time.value = String(
      Math.min(167, startHour + Math.floor((now - start) / 90)),
    );
    paint();
    if (Number(time.value) === 167) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  play.addEventListener("click", () => {
    if (playing) {
      stop();
      return;
    }
    if (reduced.matches || loading || !data) return;
    selectedEvent = null;
    paint();
    if (Number(time.value) === 167) time.value = "0";
    startHour = Number(time.value);
    start = 0;
    playing = true;
    play.textContent = "Pause week";
    root.dataset.motion = "running";
    frame = requestAnimationFrame(tick);
  });
  reduced.addEventListener("change", stop);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    }
  });
  new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) {
      stop();
    }
  }).observe(query(".internet-reading"));
  stop();
  paint();
  syncPulse();
  void loadRadar();
  root.removeAttribute("data-initialising");
}
