export function mountSignature(mark: HTMLElement) {
  const path = mark.querySelector<SVGPathElement>(".signature-trace path")!;
  const circle = mark.querySelector<SVGCircleElement>(
    ".signature-trace circle",
  )!;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  let drawing: { trace: Animation; endpoint: Animation } | null = null;
  let touch = false;

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

  mark.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch" || event.buttons !== 0) return;
    draw();
  });
  mark.addEventListener("focus", () => {
    if (mark.matches(":focus-visible")) draw();
  });
  mark.addEventListener("pointerdown", (event) => {
    touch = event.pointerType === "touch";
  });
  mark.addEventListener("click", (event) => {
    if (
      !touch ||
      event.detail === 0 ||
      event.defaultPrevented ||
      preference.matches
    )
      return;
    touch = false;
    // A crossfade snapshot would cover the live stroke on the incoming page.
    addEventListener(
      "pageswap",
      (event) => {
        if (event.activation?.entry.url === new URL("/", location.href).href)
          event.viewTransition?.skipTransition();
      },
      { once: true },
    );
    try {
      // Native navigation stays immediate; the incoming document owns the run.
      sessionStorage.setItem("portfolio-signature-arrival", "touch");
    } catch {}
  });
  if (document.documentElement.hasAttribute("data-signature-arrival")) {
    const arrive = () => {
      draw();
      delete document.documentElement.dataset.signatureArrival;
    };
    // WebKit may run inline modules before the render-blocking styles load.
    if (document.readyState === "complete") arrive();
    else addEventListener("load", arrive, { once: true });
  }
  preference.addEventListener("change", () => {
    const previous = drawing;
    drawing = null;
    previous?.trace.cancel();
    previous?.endpoint.cancel();
  });
}
