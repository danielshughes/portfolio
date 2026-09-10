/** Finite animation clock. Logical results are supplied separately from frames. */
export function playback(
  root: HTMLElement,
  draw: (progress: number) => void,
  duration = 2400,
) {
  const settings = root.querySelector<HTMLDetailsElement>(
    ".experiment-settings",
  )!;
  const button = root.querySelector<HTMLButtonElement>("[data-playback]")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let progress = 0,
    paused = false,
    visible = false,
    frame = 0,
    last = 0;
  function sync() {
    cancelAnimationFrame(frame);
    last = 0;
    if (reduced.matches) progress = 1;
    const active =
      settings.open &&
      visible &&
      !document.hidden &&
      !paused &&
      !reduced.matches &&
      progress < 1;
    root.dataset.motion = active ? "running" : "paused";
    button.textContent = reduced.matches
      ? "Reduced motion on"
      : progress >= 1
        ? "Replay"
        : paused
          ? "Resume"
          : "Pause";
    button.disabled = reduced.matches;
    draw(progress);
    if (active) frame = requestAnimationFrame(tick);
  }
  function tick(time: number) {
    if (last)
      progress = Math.min(1, progress + Math.min(50, time - last) / duration);
    last = time;
    draw(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else sync();
  }
  const replay = () => {
    progress = 0;
    paused = false;
    sync();
  };
  button.addEventListener("click", () => {
    if (progress >= 1) replay();
    else {
      paused = !paused;
      sync();
    }
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(root.querySelector(".experiment-stage")!);
  settings.addEventListener("toggle", sync);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
  window.addEventListener("pagehide", () => cancelAnimationFrame(frame));
  window.addEventListener("pageshow", sync);
  // Let callers finish binding their drawing state before starting the clock.
  return { replay };
}
