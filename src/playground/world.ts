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
    const points = nodes.map(({ point: [x, y, z] }, i) => {
      const rx = x * Math.cos(theta) + z * Math.sin(theta);
      const rz = -x * Math.sin(theta) + z * Math.cos(theta);
      const ry = y * Math.cos(phi) - rz * Math.sin(phi);
      const depth = y * Math.sin(phi) + rz * Math.cos(phi);
      const perspective = 4 / (4 + depth);
      // Fixed inset reserves node radii and labels across every camera angle.
      // Keep the scale stable while rotating rather than making the scene breathe.
      const scale = Math.max(
        1,
        Math.min((width - 72) / 6.2, (height - 72) / 4.5),
      );
      return {
        x: width / 2 + rx * scale * perspective,
        y: height / 2 + ry * scale * perspective,
        depth,
        radius: 6 * perspective,
        connected:
          selected === -1 ||
          i === selected ||
          edges.some(
            ([a, b]) =>
              (a === selected && b === i) || (b === selected && a === i),
          ),
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
      ctx.globalAlpha = p.connected ? 1 : 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius + (p.i === selected ? 3 : 0), 0, Math.PI * 2);
      ctx.fillStyle = p.i === selected ? accent : paper;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Projected nodes can coincide. Place their labels separately, after every
    // node is drawn, so neither another label nor a foreground node hides one.
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    type Box = { left: number; right: number; top: number; bottom: number };
    const overlaps = (a: Box, b: Box) =>
      a.left < b.right + 4 &&
      a.right + 4 > b.left &&
      a.top < b.bottom + 4 &&
      a.bottom + 4 > b.top;
    const occupied: Box[] = points.map((p) => ({
      left: p.x - p.radius - 3,
      right: p.x + p.radius + 3,
      top: p.y - p.radius - 3,
      bottom: p.y + p.radius + 3,
    }));
    // Stable node order prevents depth-sort changes from swapping label priority.
    points.forEach((p, i) => {
      const name = nodes[i].name;
      const metrics = ctx.measureText(name);
      const half = metrics.width / 2;
      const ascent = metrics.actualBoundingBoxAscent;
      const descent = metrics.actualBoundingBoxDescent;
      const candidates = Array.from({ length: 10 }, (_, ring) => {
        const gap = 10 + ring * 12;
        const below = p.y + p.radius + gap + ascent;
        const above = p.y - p.radius - gap - descent;
        const left = p.x - p.radius - gap - half;
        const right = p.x + p.radius + gap + half;
        const middle = p.y + (ascent - descent) / 2;
        return [
          [p.x, below],
          [p.x, above],
          [right, middle],
          [left, middle],
          [right, below],
          [left, below],
          [right, above],
          [left, above],
        ];
      })
        .flat()
        .map(([x, y]) => {
          x = Math.max(half + 4, Math.min(width - half - 4, x));
          y = Math.max(ascent + 4, Math.min(height - descent - 4, y));
          return {
            x,
            y,
            left: x - half,
            right: x + half,
            top: y - ascent,
            bottom: y + descent,
          };
        });
      const label =
        candidates.find((candidate) =>
          occupied.every((other) => !overlaps(candidate, other)),
        ) ?? candidates[0];
      occupied.push(label);
      ctx.globalAlpha = p.connected ? 1 : 0.3;
      if (label !== candidates[0]) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(
          Math.max(label.left, Math.min(label.right, p.x)),
          Math.max(label.top, Math.min(label.bottom, p.y)),
        );
        ctx.stroke();
      }
      ctx.fillStyle = ink;
      ctx.fillText(name, label.x, label.y);
    });
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
