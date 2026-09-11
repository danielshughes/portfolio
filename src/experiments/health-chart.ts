import { HEALTH_INTERVAL_MS, HEALTH_WINDOW_MS } from "./health-model";

interface Reading {
  observed_at: number;
  elapsed_ms: number;
  status: number;
  ok: number;
}
const svgNS = "http://www.w3.org/2000/svg";
const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

// Call only after the response and its dated measurement window are validated.
export function renderHealthChart(
  root: HTMLElement,
  samples: Reading[],
  start: number,
) {
  const q = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;
  const svg = q<SVGSVGElement>(".health-figure svg");
  const failures = q<SVGGElement>("[data-health-failures]");
  const points = q<SVGGElement>("[data-health-points]");
  const control = q<HTMLInputElement>("#health-reading");
  const readout = q<HTMLElement>("[data-health-reading]");
  const selected = q<SVGGElement>("[data-health-selected]");
  const scale = Math.max(100, ...samples.map((sample) => sample.elapsed_ms));
  const positions = samples.map((sample) => ({
    x: ((sample.observed_at - start) / HEALTH_WINDOW_MS) * 600,
    y: sample.ok ? 145 - Math.min(1, sample.elapsed_ms / scale) * 130 : 139,
  }));
  points.replaceChildren();
  failures.replaceChildren();
  selected.setAttribute("visibility", "hidden");
  q<HTMLElement>(".health-inspector").hidden = !samples.length;
  q<HTMLElement>("[data-health-scale]").textContent =
    `Vertical scale: 0–${Math.ceil(scale)} ms. Horizontal scale: the observed window.`;
  let path = "";
  samples.forEach((sample, index) => {
    const { x, y } = positions[index];
    if (sample.ok) {
      const previous = samples[index - 1];
      path += `${previous?.ok && sample.observed_at - previous.observed_at <= HEALTH_INTERVAL_MS ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
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
  });
  q<SVGPathElement>("[data-health-line]").setAttribute("d", path);
  const select = (index: number) => {
    const sample = samples[index];
    if (!sample) return;
    const { x, y } = positions[index];
    control.value = String(index);
    const label = `${date.format(sample.observed_at)} UTC · ${sample.ok ? "HTML headers received" : "Failed check"} · ${sample.status ? `HTTP ${sample.status}` : "No HTTP response"} · ${sample.elapsed_ms.toLocaleString("en-GB")} ms`;
    readout.textContent = label;
    control.setAttribute("aria-valuetext", label);
    q<SVGPathElement>("[data-health-cursor]").setAttribute("d", `M${x} 15V145`);
    const ring = q<SVGCircleElement>("[data-health-ring]");
    ring.setAttribute("cx", String(x));
    ring.setAttribute("cy", String(y));
    selected.setAttribute("visibility", "visible");
  };
  control.max = String(Math.max(0, samples.length - 1));
  control.disabled = !samples.length;
  control.oninput = () => select(control.valueAsNumber);
  svg.onpointermove = (event) => {
    // Match the actual SVG coordinate space, including aspect-ratio letterboxing.
    const transform = svg.getScreenCTM();
    if (!transform || !samples.length) return;
    const pointer = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      transform.inverse(),
    );
    let nearest = 0;
    positions.forEach(({ x }, index) => {
      if (Math.abs(x - pointer.x) < Math.abs(positions[nearest].x - pointer.x))
        nearest = index;
    });
    select(nearest);
  };
  select(samples.length - 1);
}
