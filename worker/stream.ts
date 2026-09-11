import { apiJson, sameOrigin, emptyRequestBody } from "./http.ts";

export const STREAM_PARTS = [
  "A response",
  "does not",
  "have to",
  "arrive",
  "all at",
  "once.",
] as const;
export async function streamDemo(request: Request) {
  if (request.method !== "POST")
    return apiJson({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request))
    return apiJson({ error: "origin_not_allowed" }, 403);
  if (new URL(request.url).search || !(await emptyRequestBody(request)))
    return apiJson({ error: "invalid_query" }, 400);
  let index = 0,
    cancelled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      // At most six small frames over 1.5 seconds, with back-pressure. No
      // detached producer, storage, upstream request or visitor-supplied text.
      if (index > 0) await scheduler.wait(300);
      if (cancelled) return;
      if (request.signal.aborted) {
        controller.close();
        return;
      }
      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            sequence: index + 1,
            text: STREAM_PARTS[index],
            done: index === STREAM_PARTS.length - 1,
          }) + "\n",
        ),
      );
      if (++index === STREAM_PARTS.length) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store, no-transform",
      "x-content-type-options": "nosniff",
    },
  });
}
