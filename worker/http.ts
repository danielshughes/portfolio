export function apiJson(body: unknown, status = 200, cache = "no-store") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

export function sameOrigin(request: Request) {
  return (
    request.headers.get("origin") === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
