export function mountSignature(mark: HTMLElement) {
  const path = mark.querySelector<SVGPathElement>(".signature-trace path")!;
  const circle = mark.querySelector<SVGCircleElement>(
    ".signature-trace circle",
  )!;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let drawing: { trace: Animation; endpoint: Animation } | null = null;

  function draw() {
    if (preference.matches || drawing) return;
    const length = `${path.getTotalLength()}px`;
    const trace = path.animate(
      [
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDasharray: length, strokeDashoffset: "0px" },
      ],
      { duration: 650, easing: "linear", fill: "forwards" },
    );
    const endpoint = circle.animate(
      [{ opacity: 0 }, { opacity: 0, offset: 650 / 780 }, { opacity: 1 }],
      {
        duration: 780,
        easing: "linear",
        fill: "forwards",
      },
    );
    drawing = { trace, endpoint };
    void Promise.all([trace.finished, endpoint.finished]).then(
      () => {
        // A cancelled run must never settle a newer interaction.
        if (drawing?.trace !== trace) return;
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
