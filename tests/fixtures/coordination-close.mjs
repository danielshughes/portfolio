import { CoordinationRoom } from "../../worker/coordination.ts";

export { CoordinationRoom };

// Exercise the production handler against workerd's real WebSocket validation.
// This fixture is only bundled by the isolated test harness, never deployed.
export default {
  async fetch(request) {
    const code = Number(new URL(request.url).searchParams.get("code"));
    const pair = new WebSocketPair();
    pair[0].accept();
    pair[1].accept();
    try {
      const closed = new Promise((resolve) => {
        pair[0].addEventListener("close", (event) => resolve(event.code), {
          once: true,
        });
      });
      CoordinationRoom.prototype.webSocketClose(pair[1], code);
      return Response.json({ code: await closed });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Close failed" },
        { status: 500 },
      );
    } finally {
      pair[0].close(1000);
      pair[1].close(1000);
    }
  },
};
