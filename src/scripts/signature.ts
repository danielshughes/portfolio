export function mountSignature(mark: HTMLElement) {
  const path = mark.querySelector<SVGPathElement>(".signature-trace path")!;
  const circle = mark.querySelector<SVGCircleElement>(
    ".signature-trace circle",
  )!;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let drawing: { trace: Animation; endpoint: Animation } | null = null;

  function draw() {
    if (preference.matches || drawing) return;
    const trace = path.animate(
      [
        { strokeDasharray: "100", strokeDashoffset: "100" },
        { strokeDasharray: "100", strokeDashoffset: "0" },
      ],
      { duration: 650, easing: "ease-out" },
    );
    const endpoint = circle.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 650,
      easing: "steps(1, end)",
    });
    drawing = { trace, endpoint };
    void trace.finished.then(
      () => {
        // A cancelled run must never settle a newer interaction.
        if (drawing?.trace !== trace) return;
        endpoint.finish();
        trace.cancel();
        endpoint.cancel();
        drawing = null;
      },
      () => {},
    );
  }

  mark.addEventListener("pointerenter", draw);
  mark.addEventListener("focus", draw);
  preference.addEventListener("change", () => {
    const previous = drawing;
    drawing = null;
    previous?.trace.cancel();
    previous?.endpoint.cancel();
  });
}
