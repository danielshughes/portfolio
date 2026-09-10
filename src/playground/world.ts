// Small perspective-projected graph. Canvas keeps this experiment independent
// of WebGL support; controls and the adjacency list work without a 3D camera.
import { nodes, edges } from "./topology";

export function mountWorld(root: HTMLElement) {
  const settings = root.querySelector<HTMLDetailsElement>(
    ".experiment-settings",
  )!;
  const canvas = root.querySelector("canvas")!;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const controls = root.querySelector<HTMLElement>(".experiment-controls")!;
  const rotation = controls.querySelector<HTMLInputElement>("[name=rotation]")!;
  const tilt = controls.querySelector<HTMLInputElement>("[name=tilt]")!;
  const pause = controls.querySelector<HTMLButtonElement>("[data-pause]")!;
  const choices = [
    ...controls.querySelectorAll<HTMLButtonElement>("[data-node]"),
  ];
  const output = root.querySelector("output")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let selected = -1,
    paused = false,
    visible = false,
    frame = 0,
    last = 0;
  let angle = 25,
    width = 800,
    height = 400;
  controls.hidden = false;
  canvas.hidden = false;
  root.classList.add("world-ready");

  function draw() {
    if (!ctx) return;
    const styles = getComputedStyle(root);
    const ink = styles.getPropertyValue("--ink").trim();
    const accent = styles.getPropertyValue("--preview-accent").trim();
    const paper = styles.getPropertyValue("--paper").trim();
    const theta = (angle * Math.PI) / 180,
      phi = (Number(tilt.value) * Math.PI) / 180;
    ctx.clearRect(0, 0, Math.ceil(width), Math.ceil(height));
    const points = nodes.map(({ point: [x, y, z] }) => {
      const rx = x * Math.cos(theta) + z * Math.sin(theta);
      const rz = -x * Math.sin(theta) + z * Math.cos(theta);
      const ry = y * Math.cos(phi) - rz * Math.sin(phi);
      const depth = y * Math.sin(phi) + rz * Math.cos(phi);
      const perspective = 4 / (4 + depth);
      const scale = Math.min(width / 6.2, height / 4.5);
      return {
        x: width / 2 + rx * scale * perspective,
        y: height / 2 + ry * scale * perspective,
        depth,
        radius: 6 * perspective,
      };
    });
    for (const [a, b] of edges) {
      const active = selected === -1 || a === selected || b === selected;
      ctx.globalAlpha = active ? 0.8 : 0.14;
      ctx.strokeStyle = selected !== -1 && active ? accent : ink;
      ctx.lineWidth = active ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(points[a].x, points[a].y);
      ctx.lineTo(points[b].x, points[b].y);
      ctx.stroke();
      // A bead locates the midpoint without implying direction or live traffic.
      ctx.beginPath();
      ctx.arc(
        (points[a].x + points[b].x) / 2,
        (points[a].y + points[b].y) / 2,
        2,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = accent;
      ctx.fill();
    }
    const order = points
      .map((p, i) => ({ ...p, i }))
      .sort((a, b) => b.depth - a.depth);
    for (const p of order) {
      const connected =
        selected === -1 ||
        p.i === selected ||
        edges.some(
          ([a, b]) =>
            (a === selected && b === p.i) || (b === selected && a === p.i),
        );
      ctx.globalAlpha = connected ? 1 : 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + (p.i === selected ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = p.i === selected ? accent : paper;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = ink;
      ctx.fillText(nodes[p.i].name, p.x, p.y + p.radius + 19);
    }
    ctx.globalAlpha = 1;
  }
  function tick(time: number) {
    angle = (angle + (last ? Math.min(time - last, 50) * 0.006 : 0)) % 360;
    last = time;
    rotation.value = String(Math.round(angle));
    draw();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    last = 0;
    const active =
      settings.open &&
      visible &&
      !document.hidden &&
      !paused &&
      !reduced.matches;
    root.dataset.motion = active ? "running" : "paused";
    pause.textContent = reduced.matches
      ? "Reduced motion on"
      : paused
        ? "Resume rotation"
        : "Pause rotation";
    pause.disabled = reduced.matches;
    draw();
    if (active) frame = requestAnimationFrame(tick);
  }
  new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(canvas);
  for (const input of [rotation, tilt])
    input.addEventListener("input", () => {
      paused = true;
      angle = Number(rotation.value);
      sync();
    });
  let drag: { id: number; x: number; angle: number } | undefined;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    paused = true;
    drag = { id: event.pointerId, x: event.clientX, angle };
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
    sync();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    angle = (((drag.angle + (event.clientX - drag.x) * 0.5) % 360) + 360) % 360;
    rotation.value = String(Math.round(angle));
    draw();
  });
  function endDrag() {
    drag = undefined;
    delete canvas.dataset.dragging;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);
  choices.forEach((button, i) =>
    button.addEventListener("click", () => {
      selected = selected === i ? -1 : i;
      choices.forEach((choice, j) =>
        choice.setAttribute("aria-pressed", String(selected === j)),
      );
      const neighbours = edges.flatMap(([a, b]) =>
        a === selected
          ? [nodes[b].name]
          : b === selected
            ? [nodes[a].name]
            : [],
      );
      output.textContent =
        selected === -1
          ? "All connections visible."
          : `${nodes[selected].name} connects to ${neighbours.join(", ")}. Other connections are dimmed.`;
      draw();
    }),
  );
  pause.addEventListener("click", () => {
    paused = !paused;
    sync();
  });
  controls.querySelector("[data-reset]")!.addEventListener("click", () => {
    angle = 25;
    rotation.value = "25";
    tilt.value = "15";
    selected = -1;
    paused = false;
    choices.forEach((button) => button.setAttribute("aria-pressed", "false"));
    output.textContent = "All connections visible.";
    sync();
  });
  settings.addEventListener("toggle", sync);
  reduced.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  document.addEventListener("themechange", draw);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
  });
  window.addEventListener("pageshow", sync);
  sync();
}
