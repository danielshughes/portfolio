export function apiJson(body: unknown, status = 200, cache = "no-store") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

export function sameOrigin(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
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
