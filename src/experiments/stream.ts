export function mountStream(root: HTMLElement) {
  const start = root.querySelector<HTMLButtonElement>("[data-stream-run]")!;
  const stop = root.querySelector<HTMLButtonElement>("[data-stream-stop]")!;
  const status = root.querySelector<HTMLElement>("[data-stream-status]")!;
  const output = root.querySelector<HTMLElement>("[data-stream-output]")!;
  const markers = [...root.querySelectorAll<SVGElement>("[data-stream-chunk]")];
  let controller: AbortController | undefined;
  const cancel = () => controller?.abort();
  start.addEventListener("click", () => {
    if (controller) return;
    const current = new AbortController();
    controller = current;
    start.disabled = true;
    stop.disabled = false;
    output.textContent = "";
    markers.forEach((marker) => marker.removeAttribute("data-received"));
    status.textContent = "Opening the stream…";
    void (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetch("/api/stream", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.any([current.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new Error(
            response.status === 429
              ? "Request limit reached. Try again later."
              : "The stream is unavailable right now.",
          );
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "",
          size = 0,
          count = 0,
          complete = false;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 2048)
            throw new Error("The stream returned an unexpected response.");
          pending += decoder.decode(chunk.value, { stream: true });
          let newline: number;
          while ((newline = pending.indexOf("\n")) >= 0) {
            const frame: unknown = JSON.parse(pending.slice(0, newline));
            pending = pending.slice(newline + 1);
            if (
              !frame ||
              typeof frame !== "object" ||
              !("sequence" in frame) ||
              frame.sequence !== count + 1 ||
              !("text" in frame) ||
              typeof frame.text !== "string" ||
              frame.text.length > 80 ||
              !("done" in frame) ||
              frame.done !== (count === 5) ||
              count >= 6
            )
              throw new Error("The stream returned an unexpected response.");
            output.append(
              document.createTextNode((count ? " " : "") + frame.text),
            );
            markers[count].setAttribute("data-received", "true");
            count++;
            complete = frame.done === true;
          }
        }
        if (!complete || pending.trim())
          throw new Error("The stream ended before every chunk arrived.");
        status.textContent =
          "Six chunks received. The network may group some arrivals together.";
      } catch (error) {
        status.textContent = current.signal.aborted
          ? "Stream stopped. Received text stays visible."
          : error instanceof Error &&
              ![
                "AbortError",
                "TimeoutError",
                "SyntaxError",
                "TypeError",
              ].includes(error.name)
            ? error.message
            : "The stream is unavailable right now. Try again shortly.";
      } finally {
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
        controller = undefined;
        start.disabled = false;
        stop.disabled = true;
      }
    })();
  });
  stop.addEventListener("click", cancel);
  root.querySelector("details")?.addEventListener("toggle", (event) => {
    if (!(event.currentTarget as HTMLDetailsElement).open) cancel();
  });
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) cancel();
  });
  observer.observe(root);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancel();
  });
  window.addEventListener("pagehide", cancel);
  start.disabled = false;
}
