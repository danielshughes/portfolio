import { CoordinationRoom as ProductionRoom } from "../../worker/coordination.ts";

export class CoordinationRoom extends ProductionRoom {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS close_events (code INTEGER, error TEXT)",
    );
  }
  webSocketClose(socket, code) {
    let error = null;
    try {
      super.webSocketClose(socket, code);
    } catch (cause) {
      error = cause.message;
      throw cause;
    } finally {
      this.ctx.storage.sql.exec(
        "INSERT INTO close_events VALUES (?, ?)",
        code,
        error,
      );
    }
  }
  async fetch(request) {
    if (new URL(request.url).pathname === "/api/close-events")
      return Response.json(
        this.ctx.storage.sql
          .exec("SELECT code, error FROM close_events")
          .toArray(),
      );
    return super.fetch(request);
  }
}

// Exercise the production handler against workerd's real WebSocket validation.
// This fixture is only bundled by the isolated test harness, never deployed.
export default {
  async fetch(request, env) {
    if (
      ["/api/coordination", "/api/close-events"].includes(
        new URL(request.url).pathname,
      )
    )
      return env.COORDINATION.getByName("disconnect-test").fetch(request);
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
      ProductionRoom.prototype.webSocketClose(pair[1], code);
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
