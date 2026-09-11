import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";

// Real HTTP boundary for browser credentials and module-failure recovery.
// Assets remain the build under test; only explicitly handled responses differ.
export async function serveFixture(
  handle: (request: IncomingMessage, response: ServerResponse) => boolean,
) {
  const server = createServer((request, response) => {
    if (handle(request, response)) return;
    void (async () => {
      const asset = await fetch(`http://127.0.0.1:4322${request.url}`);
      // Retain the build's actual security policy. fetch decodes the body, so
      // transport framing/encoding headers cannot describe the forwarded bytes.
      const excluded = new Set([
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "proxy-connection",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "content-encoding",
        "content-length",
        ...(asset.headers
          .get("connection")
          ?.toLowerCase()
          .split(",")
          .map((name) => name.trim()) ?? []),
      ]);
      const headers = Object.fromEntries(
        [...asset.headers].filter(([name]) => !excluded.has(name)),
      );
      headers["cache-control"] = "no-store";
      response.writeHead(asset.status, headers);
      response.end(Buffer.from(await asset.arrayBuffer()));
    })().catch(() => {
      response.writeHead(502);
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server unavailable");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
