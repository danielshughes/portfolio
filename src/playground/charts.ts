import { latencies, percentile, schedule } from "./models";
import { playback } from "./playback";

export function mountChart(root: HTMLElement) {
  const controls = root.querySelector<HTMLElement>(".experiment-controls")!;
  const chart = root.querySelector<SVGSVGElement>(".data-chart")!;
  const output = root.querySelector("output")!;
  const inputs = [...controls.querySelectorAll("input")];
  const defaults = inputs.map((input) => input.value);
  controls.hidden = false;
  let samples: number[] = [];
  let requests: ReturnType<typeof schedule> = [];
  let deadline = 1000;
  const player = playback(root, (progress) => {
    if (root.dataset.experiment === "latency") {
      chart.innerHTML = samples
        .map((value, i) => {
          const height = (value / 2000) * 260 * (1 - Math.pow(1 - progress, 3));
          return `<rect x="${i * 8}" y="${280 - height}" width="5" height="${height}" class="${i >= 90 ? "tail" : ""}" />`;
        })
        .join("");
    } else {
      const scale = 760 / Math.max(requests.at(-1)!.end, deadline);
      const elapsed = deadline * progress;
      chart.innerHTML =
        '<defs><pattern id="timeout-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" /></pattern></defs>' +
        requests
          .map((request, i) => {
            const start = request.start * scale;
            const work =
              Math.max(0, Math.min(request.end, elapsed) - request.start) *
              scale;
            return `<rect class="cancelled" x="${start}" y="${i * 23 + 8}" width="${request.end * scale - start - 2}" height="14"/>${work > 0 ? `<rect x="${start}" y="${i * 23 + 8}" width="${Math.max(0, work - 2)}" height="14" class="${!request.completed && progress === 1 ? "timeout" : ""}" />` : ""}`;
          })
          .join("") +
        `<line class="deadline" x1="${deadline * scale}" x2="${deadline * scale}" y1="0" y2="290"/><line class="cursor" x1="${elapsed * scale}" x2="${elapsed * scale}" y1="0" y2="290"/>`;
    }
  });
  function update() {
    inputs.forEach((input) =>
      input.setAttribute(
        "aria-valuetext",
        input.value +
          (input.name === "concurrency"
            ? " requests at a time"
            : " milliseconds"),
      ),
    );
    if (root.dataset.experiment === "latency") {
      samples = latencies(Number(inputs[0].value)).sort((a, b) => a - b);
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      output.textContent = `Mean ${Math.round(mean)} ms · Median ${Math.round(percentile(samples, 50))} ms · p95 ${Math.round(percentile(samples, 95))} ms · p99 ${Math.round(percentile(samples, 99))} ms`;
    } else {
      const [concurrency, latency, limit] = inputs.map((input) =>
        Number(input.value),
      );
      deadline = limit;
      requests = schedule(concurrency, latency, deadline);
      output.textContent = `${requests.filter((r) => r.completed).length} of 12 requests finish within ${deadline} ms. ${concurrency} at a time, ${latency} ms per request.`;
    }
    player.replay();
  }
  inputs.forEach((input) => input.addEventListener("input", update));
  controls.querySelector("[data-reset]")!.addEventListener("click", () => {
    inputs.forEach((input, i) => (input.value = defaults[i]));
    update();
  });
  update();
}
