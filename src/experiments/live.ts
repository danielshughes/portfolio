import { isTriageScenario, triageScenarios } from "./triage-scenarios";
import { isTriageAnswer } from "./triage-answer";
import { humanToken } from "./turnstile";
import { mountStream } from "./stream";
import { renderHealthChart } from "./health-chart";
import { HEALTH_WINDOW_MS, HEALTH_EXPECTED_SAMPLES } from "./health-model";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const stamp = (time: number) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(time);
const datedStamp = (time: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(time);

class ExperimentError extends Error {}

async function readJson(
  url: string,
  signal: AbortSignal,
  method = "GET",
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    signal,
    redirect: "error",
    headers: { accept: "application/json", ...headers },
  });
  if (response.status === 429) {
    await response.body?.cancel();
    throw new ExperimentError(
      "This experiment has reached its request limit. Try again later.",
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
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!response.ok && record(data) && typeof data.error === "string") {
    if (data.error.startsWith("verification_"))
      throw new ExperimentError(
        "Human verification could not be completed. Press Run to try again.",
      );
    if (data.error === "model_response_incomplete")
      throw new ExperimentError(
        "The model did not return a complete answer. Nothing partial is shown. You can try another run.",
      );
  }
  if (!response.ok)
    throw new ExperimentError(
      response.status === 503 &&
        record(data) &&
        data.error === "local_inference_unavailable"
        ? "Workers AI needs a Cloudflare connection. Local preview does not run inference; try this on the deployed development site."
        : "This experiment is unavailable right now. Try again shortly.",
    );
  return data;
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
    ["observed_at", "status", "elapsed_ms", "ok"].every((key) =>
      Number.isSafeInteger(value[key]),
    ) &&
    Number(value.elapsed_ms) >= 0 &&
    Number(value.observed_at) >= 0 &&
    (value.status === 0 ||
      (Number(value.status) >= 100 && Number(value.status) <= 599)) &&
    (value.ok !== 1 || value.status === 200) &&
    [0, 1].includes(Number(value.ok))
  );
}

export function mountLiveExperiments(root: HTMLElement) {
  mountStream(root.querySelector<HTMLElement>("#stream")!);
  const q = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;
  const controllers = new Map<string, AbortController>();
  const loaded = new Set<string>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const errorText = (error: unknown) =>
    error instanceof ExperimentError
      ? error.message
      : "This experiment is unavailable right now. Try again shortly.";
  async function run(
    name: string,
    action: (signal: AbortSignal) => Promise<void>,
    timeoutMs = 20000,
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
        AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      );
    } catch (error) {
      if (controller.signal.reason === "scenario-changed") return;
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
        data.mode === "local"
          ? "Local preview. Connection metadata is available on the deployed site."
          : "Observed for this request. Nothing precise or private is mapped.";
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
        typeof data.window.end !== "string" ||
        !Array.isArray(data.samples) ||
        data.samples.length > HEALTH_EXPECTED_SAMPLES ||
        !data.samples.every(isSample)
      )
        throw new Error("Invalid samples");
      const samples: Sample[] = data.samples;
      const start = Date.parse(data.window.start);
      const end = Date.parse(data.window.end);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end - start !== HEALTH_WINDOW_MS ||
        samples.some(
          (sample, index) =>
            sample.observed_at <= start ||
            sample.observed_at > end ||
            (index > 0 && sample.observed_at <= samples[index - 1].observed_at),
        )
      )
        throw new Error("Invalid window");
      q<HTMLElement>("[data-health-window]").textContent =
        `Observed window: ${datedStamp(start)} to ${datedStamp(end)} UTC.`;
      const status = q<HTMLElement>("[data-health-status]");
      status.textContent = samples.length
        ? `${samples.length} of ${HEALTH_EXPECTED_SAMPLES} scheduled samples in this window. ${samples.filter((s) => s.ok).length} returned HTTP 200 with HTML headers. Latest check ${datedStamp(samples.at(-1)!.observed_at)} UTC.`
        : "No samples yet. The history starts with real scheduled checks, not a filled-in chart.";
      const empty = q<SVGTextElement>("[data-health-empty]");
      empty.textContent = samples.length ? "" : "No samples yet.";
      const table = q<HTMLDetailsElement>(".sample-table");
      table.hidden = !samples.length;
      renderHealthChart(q<HTMLElement>("#health"), samples, start);
      q<HTMLTableSectionElement>("[data-health-rows]").replaceChildren(
        ...samples
          .slice(-5)
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
    answer = q<HTMLElement>("[data-triage-answer]"),
    triageRun = q<HTMLButtonElement>("[data-triage-run]");
  scenario.addEventListener("change", () => {
    if (!isTriageScenario(scenario.value)) return;
    controllers.get("triage")?.abort("scenario-changed");
    q<HTMLElement>("[data-triage-evidence]").textContent =
      triageScenarios[scenario.value].evidence;
    q<HTMLElement>("[data-triage-question]").textContent =
      triageScenarios[scenario.value].question;
    q<HTMLElement>("[data-triage-interpretation]").textContent =
      triageScenarios[scenario.value].interpretation;
    answer.textContent = "";
    answer.hidden = true;
    q<HTMLDetailsElement>(".triage-reference").open = true;
    q<HTMLElement>("[data-triage-status]").textContent =
      "Ready. No model request until you press Run.";
  });
  triageRun.addEventListener(
    "click",
    () =>
      void run(
        "triage",
        async (signal) => {
          const selected = scenario.value;
          if (!isTriageScenario(selected)) return;
          answer.textContent = "";
          answer.hidden = true;
          q<HTMLDetailsElement>(".triage-reference").open = true;
          const configuration = await readJson("/api/triage-config", signal);
          if (
            !record(configuration) ||
            typeof configuration.local !== "boolean"
          )
            throw new Error("Invalid configuration");
          let token: string | undefined;
          if (!configuration.local) {
            if (
              typeof configuration.siteKey !== "string" ||
              !configuration.siteKey
            )
              throw new Error("Verification unavailable");
            q<HTMLElement>("[data-triage-status]").textContent =
              "Checking this request…";
            try {
              token = await humanToken(
                q<HTMLElement>("[data-triage-verification]"),
                configuration.siteKey,
                selected,
                signal,
              );
            } catch {
              if (signal.aborted) signal.throwIfAborted();
              throw new ExperimentError(
                "Human verification could not be completed. Press Run to try again.",
              );
            }
          }
          signal.throwIfAborted();
          q<HTMLElement>("[data-triage-status]").textContent =
            "The model is considering this scenario…";
          const data = await readJson(
            `/api/triage?scenario=${encodeURIComponent(selected)}`,
            AbortSignal.any([signal, AbortSignal.timeout(25000)]),
            "POST",
            token ? { "cf-turnstile-response": token } : {},
          );
          if (signal.aborted || scenario.value !== selected) return;
          if (
            !record(data) ||
            data.scenario !== selected ||
            !isTriageAnswer(data.answer)
          )
            throw new Error("Invalid answer");
          const heading = document.createElement("h4");
          heading.textContent = "Model suggestion";
          answer.append(heading);
          const section = (label: string, text: string) => {
            const title = document.createElement("h5");
            title.textContent = label;
            const paragraph = document.createElement("p");
            paragraph.textContent = text;
            answer.append(title, paragraph);
          };
          section("A possible explanation", data.answer.hypothesis);
          const checksHeading = document.createElement("h5");
          checksHeading.textContent = "Read-only checks to make next";
          const checks = document.createElement("ol");
          for (const text of data.answer.checks) {
            const item = document.createElement("li");
            item.textContent = text;
            checks.append(item);
          }
          answer.append(checksHeading, checks);
          section("Still unknown", data.answer.unknown);
          answer.hidden = false;
          q<HTMLDetailsElement>(".triage-reference").open = false;
          q<HTMLElement>("[data-triage-status]").textContent =
            "Answer ready. A suggestion to assess, not a verified diagnosis.";
        },
        120000,
      ),
  );

  const room = q<HTMLElement>('[data-live="room"]'),
    details = room.querySelector<HTMLDetailsElement>("details")!;
  const connect = q<HTMLButtonElement>("[data-room-connect]"),
    send = q<HTMLButtonElement>("[data-room-send]"),
    status = q<HTMLElement>("[data-room-status]");
  let socket: WebSocket | undefined;
  let pulse: Animation[] = [];
  let cooldown: number | undefined;
  let diagramInView = false;
  const roomIsVisible = () => {
    const bounds = room.getBoundingClientRect();
    return (
      bounds.bottom > 0 &&
      bounds.top < innerHeight &&
      bounds.right > 0 &&
      bounds.left < innerWidth
    );
  };
  const stopPulse = () => {
    pulse.forEach((animation) => animation.cancel());
    pulse = [];
  };
  function disconnect(message = "Disconnected.") {
    const previous = socket;
    socket = undefined;
    previous?.close(1000, "View inactive");
    stopPulse();
    q<HTMLElement>("[data-room-sequence]").textContent = "Not connected";
    window.clearTimeout(cooldown);
    send.disabled = true;
    connect.disabled = false;
    connect.textContent = "Connect";
    status.textContent = message;
  }
  const observer = new IntersectionObserver(() => {
    // Observer delivery can lag a scroll or explicit click. Use current bounds.
    if (!roomIsVisible() && socket) disconnect();
  });
  observer.observe(room);
  new IntersectionObserver(([entry]) => {
    diagramInView = entry.isIntersecting;
    if (!diagramInView) stopPulse();
  }).observe(room.querySelector(".experiment-stage")!);
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
    if (!details.open || document.hidden || !roomIsVisible()) return;
    const url = new URL("/api/coordination", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url);
    socket = current;
    connect.disabled = true;
    q<HTMLElement>("[data-room-sequence]").textContent = "Waiting for state";
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
        !["snapshot", "pulse"].includes(String(data.kind)) ||
        !Number.isInteger(data.sequence) ||
        Number(data.sequence) < 0 ||
        Number(data.sequence) > 1000000
      )
        return;
      q<HTMLElement>("[data-room-sequence]").textContent = String(
        data.sequence,
      );
      if (data.kind === "snapshot") return;
      stopPulse();
      if (!reduced.matches && diagramInView && !document.hidden && details.open)
        pulse = [
          q<SVGCircleElement>(".room-pulse").animate(
            [
              { transform: "translateX(-210px)", opacity: 0, offset: 0 },
              { transform: "translateX(-210px)", opacity: 1, offset: 0.08 },
              { transform: "translateX(0px)", opacity: 1, offset: 0.45 },
              { transform: "translateX(0px)", opacity: 1, offset: 0.55 },
              { transform: "translateX(210px)", opacity: 1, offset: 0.92 },
              { transform: "translateX(210px)", opacity: 0, offset: 1 },
            ],
            { duration: 1000, easing: "linear" },
          ),
          q<SVGCircleElement>(".room-arrival").animate(
            [
              { opacity: 0, transform: "scale(0.9)" },
              { opacity: 0.8, transform: "scale(1)", offset: 0.2 },
              { opacity: 0, transform: "scale(1.3)" },
            ],
            { duration: 500, delay: 850, easing: "ease-out" },
          ),
        ];
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
    if (reduced.matches) stopPulse();
  });
  window.addEventListener("pagehide", () => {
    disconnect();
    for (const controller of controllers.values()) controller.abort();
  });
  // Native controls must not accept an interaction before the lazy handlers
  // exist. Leave Send pulse gated separately by its WebSocket connection.
  scenario.disabled = false;
  triageRun.disabled = false;
  connect.disabled = false;
}
