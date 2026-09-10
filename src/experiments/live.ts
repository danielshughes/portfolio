import { isTriageScenario, triageScenarios } from "./triage-scenarios";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const svgNS = "http://www.w3.org/2000/svg";
const stamp = (time: number) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(time);

async function readJson(
  url: string,
  signal: AbortSignal,
  method = "GET",
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    signal,
    redirect: "error",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      response.status === 429
        ? "This experiment has reached its request limit. Try again later."
        : "This experiment is unavailable right now. Try again shortly.",
    );
  }
  // Responses have fixed server-side limits; enforce a browser-side bound too.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response received.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("Unexpected response.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

interface Sample {
  observed_at: number;
  status: number;
  elapsed_ms: number;
  ok: number;
}
function isSample(value: unknown): value is Sample {
  return (
    record(value) &&
    ["observed_at", "status", "elapsed_ms", "ok"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) &&
    Number(value.elapsed_ms) >= 0 &&
    [0, 1].includes(Number(value.ok))
  );
}

export function mountLiveExperiments(root: HTMLElement) {
  const q = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;
  const controllers = new Map<string, AbortController>();
  const loaded = new Set<string>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const errorText = (error: unknown) =>
    error instanceof Error &&
    error.message.startsWith("This experiment has reached its request limit.")
      ? error.message
      : "This experiment is unavailable right now. Try again shortly.";
  async function run(
    name: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) {
    if (controllers.has(name)) return;
    const controller = new AbortController();
    controllers.set(name, controller);
    const status = q<HTMLElement>(`[data-${name}-status]`),
      button = root.querySelector<HTMLButtonElement>(`[data-${name}-run]`);
    status.textContent = "Loading…";
    button?.setAttribute("aria-busy", "true");
    if (button) button.disabled = true;
    try {
      await action(
        AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      );
    } catch (error) {
      status.textContent = controller.signal.aborted
        ? "Request stopped. Open again or retry when ready."
        : errorText(error);
      const retry = root.querySelector<HTMLButtonElement>(
        `[data-${name}-retry]`,
      );
      if (retry) retry.hidden = false;
    } finally {
      controllers.delete(name);
      button?.removeAttribute("aria-busy");
      if (button) button.disabled = false;
    }
  }
  const edge = () =>
    run("edge", async (signal) => {
      const data = await readJson("/api/edge", signal);
      if (!record(data)) throw new Error("Invalid response");
      for (const key of [
        "country",
        "colo",
        "protocol",
        "tls",
        "roundTripMs",
        "network",
      ]) {
        const value = data[key];
        q<HTMLElement>(`[data-edge-${key}]`).textContent =
          value === null
            ? "Not supplied"
            : key === "roundTripMs" && typeof value === "number"
              ? `${value} ms`
              : typeof value === "string"
                ? value.slice(0, 120)
                : "Not supplied";
      }
      q<HTMLElement>("[data-edge-status]").textContent =
        "Observed for this request. Nothing precise or private is mapped.";
      q<HTMLButtonElement>("[data-edge-retry]").hidden = true;
      loaded.add("edge");
    });
  const health = () =>
    run("health", async (signal) => {
      const data = await readJson("/api/health", signal);
      if (
        !record(data) ||
        !record(data.window) ||
        typeof data.window.start !== "string" ||
        !Array.isArray(data.samples) ||
        data.samples.length > 288 ||
        !data.samples.every(isSample)
      )
        throw new Error("Invalid samples");
      const samples: Sample[] = data.samples;
      const start = Date.parse(data.window.start);
      if (!Number.isFinite(start)) throw new Error("Invalid window");
      const status = q<HTMLElement>("[data-health-status]");
      status.textContent = samples.length
        ? `${samples.length} of 288 scheduled samples in the last day. ${samples.filter((s) => s.ok).length} returned HTTP 200 with HTML headers. Latest check ${stamp(samples.at(-1)!.observed_at)} UTC.`
        : "No samples yet. The history starts with real scheduled checks, not a filled-in chart.";
      const empty = q<SVGTextElement>("[data-health-empty]");
      empty.textContent = samples.length ? "" : "No samples yet.";
      const table = q<HTMLDetailsElement>(".sample-table");
      table.hidden = !samples.length;
      const scale = Math.max(100, ...samples.map((s) => s.elapsed_ms));
      let path = "",
        previous: Sample | undefined;
      const failures = q<SVGGElement>("[data-health-failures]"),
        points = q<SVGGElement>("[data-health-points]");
      failures.replaceChildren();
      points.replaceChildren();
      q<HTMLElement>("[data-health-scale]").textContent =
        `Vertical scale: 0–${Math.ceil(scale)} ms. Horizontal scale: the last 24 hours.`;
      for (const sample of samples) {
        const x = Math.max(
            0,
            Math.min(600, ((sample.observed_at - start) / 86400000) * 600),
          ),
          y = 145 - Math.min(1, sample.elapsed_ms / scale) * 130;
        if (sample.ok) {
          path += `${previous?.ok && sample.observed_at - previous.observed_at <= 300000 ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
          const dot = document.createElementNS(svgNS, "circle");
          dot.setAttribute("cx", String(x));
          dot.setAttribute("cy", String(y));
          dot.setAttribute("r", "2");
          points.append(dot);
        } else {
          const cross = document.createElementNS(svgNS, "path");
          cross.setAttribute("d", `M${x - 3} 136l6 6m-6 0 6-6`);
          failures.append(cross);
        }
        previous = sample;
      }
      q<SVGPathElement>("[data-health-line]").setAttribute("d", path);
      q<HTMLTableSectionElement>("[data-health-rows]").replaceChildren(
        ...samples
          .slice(-12)
          .reverse()
          .map((s) => {
            const row = document.createElement("tr");
            for (const value of [
              stamp(s.observed_at),
              s.status || "No response",
              s.elapsed_ms,
            ]) {
              const cell = document.createElement("td");
              cell.textContent = String(value);
              row.append(cell);
            }
            return row;
          }),
      );
      q<HTMLButtonElement>("[data-health-retry]").hidden = true;
      loaded.add("health");
    });
  for (const [name, action] of [
    ["edge", edge],
    ["health", health],
  ] as const) {
    const details = q<HTMLDetailsElement>(`[data-live="${name}"] > details`);
    details.addEventListener("toggle", () => {
      if (details.open && !loaded.has(name)) void action();
    });
    q<HTMLButtonElement>(`[data-${name}-retry]`).addEventListener(
      "click",
      () => void action(),
    );
    if (details.open) void action();
  }
  const scenario = q<HTMLSelectElement>("#triage-scenario"),
    answer = q<HTMLElement>("[data-triage-answer]");
  scenario.addEventListener("change", () => {
    if (!isTriageScenario(scenario.value)) return;
    controllers.get("triage")?.abort();
    q<HTMLElement>("[data-triage-evidence]").textContent =
      triageScenarios[scenario.value].evidence;
    answer.textContent = "";
    answer.hidden = true;
    q<HTMLElement>("[data-triage-status]").textContent =
      "Ready. No model request until you press Run.";
  });
  q<HTMLButtonElement>("[data-triage-run]").addEventListener(
    "click",
    () =>
      void run("triage", async (signal) => {
        const selected = scenario.value;
        if (!isTriageScenario(selected)) return;
        answer.textContent = "";
        answer.hidden = true;
        const data = await readJson(
          `/api/triage?scenario=${encodeURIComponent(selected)}`,
          signal,
          "POST",
        );
        if (signal.aborted || scenario.value !== selected) return;
        if (
          !record(data) ||
          typeof data.answer !== "string" ||
          data.answer.length > 6000
        )
          throw new Error("Invalid answer");
        answer.textContent = data.answer;
        answer.hidden = false;
        q<HTMLElement>("[data-triage-status]").textContent =
          "Model response ready. Compare it with the evidence above.";
      }),
  );

  const room = q<HTMLElement>('[data-live="room"]'),
    details = room.querySelector<HTMLDetailsElement>("details")!;
  const connect = q<HTMLButtonElement>("[data-room-connect]"),
    send = q<HTMLButtonElement>("[data-room-send]"),
    status = q<HTMLElement>("[data-room-status]");
  let socket: WebSocket | undefined;
  let pulse: Animation | undefined;
  let cooldown: number | undefined;
  let inView = false;
  function disconnect(message = "Disconnected.") {
    const previous = socket;
    socket = undefined;
    previous?.close(1000, "View inactive");
    pulse?.cancel();
    window.clearTimeout(cooldown);
    send.disabled = true;
    connect.disabled = false;
    connect.textContent = "Connect";
    status.textContent = message;
  }
  const observer = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    if (!inView && socket) disconnect();
  });
  observer.observe(room);
  const onVisibility = () => {
    if (document.hidden) {
      disconnect();
      for (const controller of controllers.values()) controller.abort();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  details.addEventListener("toggle", () => {
    if (!details.open) disconnect();
  });
  connect.addEventListener("click", () => {
    if (socket) {
      disconnect();
      return;
    }
    if (!details.open || document.hidden || !inView) return;
    const url = new URL("/api/coordination", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url);
    socket = current;
    connect.disabled = true;
    status.textContent = "Connecting…";
    current.addEventListener("open", () => {
      if (socket !== current) return;
      connect.disabled = false;
      connect.textContent = "Disconnect";
      send.disabled = false;
      status.textContent =
        "Connected. Send a pulse, or open this experiment in another visible window.";
    });
    current.addEventListener("message", (event) => {
      if (
        socket !== current ||
        typeof event.data !== "string" ||
        event.data.length > 128
      )
        return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        !record(data) ||
        !Number.isInteger(data.sequence) ||
        Number(data.sequence) < 0 ||
        Number(data.sequence) > 1000000
      )
        return;
      q<HTMLElement>("[data-room-sequence]").textContent = String(
        data.sequence,
      );
      pulse?.cancel();
      if (!reduced.matches)
        pulse = q<SVGCircleElement>(".room-pulse").animate(
          [
            { transform: "translateX(-90px)", opacity: 0 },
            { opacity: 1, offset: 0.2 },
            { opacity: 1, offset: 0.8 },
            { transform: "translateX(90px)", opacity: 0 },
          ],
          { duration: 700, easing: "linear" },
        );
    });
    current.addEventListener("close", () => {
      if (socket === current)
        disconnect("Session finished. Connect again when you want to try it.");
    });
    current.addEventListener("error", () => {
      if (socket === current)
        disconnect(
          "The room is unavailable right now. Try connecting again shortly.",
        );
    });
  });
  send.addEventListener("click", () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send("pulse");
    send.disabled = true;
    cooldown = window.setTimeout(() => {
      send.disabled = socket?.readyState !== WebSocket.OPEN;
    }, 1100);
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) pulse?.cancel();
  });
  window.addEventListener("pagehide", () => {
    disconnect();
    for (const controller of controllers.values()) controller.abort();
  });
}
