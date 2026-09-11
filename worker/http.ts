export function apiJson(body: unknown, status = 200, cache = "no-store") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

export function sameOrigin(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}

export async function emptyRequestBody(request: Request): Promise<boolean> {
  if (
    ![null, "0"].includes(request.headers.get("content-length")) ||
    request.headers.has("transfer-encoding")
  )
    return false;
  if (!request.body) return true;
  // workerd can expose an empty POST as a non-null stream. Inspect only the
  // first read, never accumulate or parse caller content, and bound slow input.
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const part = await Promise.race([
      reader.read(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 1000);
      }),
    ]);
    return part?.done === true;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function isLocalPreview(
  request: Request,
  env: Pick<Env, "LOCAL_PREVIEW">,
) {
  // Wrangler can rewrite localhost to a configured custom-domain origin.
  // The local command supplies the flag; deployed environments keep it off.
  return (
    env.LOCAL_PREVIEW === "true" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  );
}
