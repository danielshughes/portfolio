import { DurableObject } from "cloudflare:workers";

const MAX_CONNECTIONS = 12;
const SESSION_MS = 120000;
const DAILY_JOIN_LIMIT = 200;
interface Session {
  expires: number;
  last: number;
  messages: number;
}

export class CoordinationRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL)",
    );
    ctx.storage.sql.exec("INSERT OR IGNORE INTO state VALUES (1,0)");
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS join_budget (id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, used INTEGER NOT NULL)",
    );
  }
  async fetch(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response(null, { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_CONNECTIONS)
      return new Response(null, { status: 429 });
    // One fixed room per environment. A persisted, atomic allowance prevents
    // reconnecting from resetting the total accepted work across locations.
    const allowed = this.ctx.storage.sql
      .exec<{ used: number }>(
        `INSERT INTO join_budget (id,day,used) VALUES (1,?,1)
       ON CONFLICT(id) DO UPDATE SET day=excluded.day, used=CASE WHEN join_budget.day=excluded.day THEN join_budget.used+1 ELSE 1 END
       WHERE join_budget.day<>excluded.day OR join_budget.used<? RETURNING used`,
        new Date().toISOString().slice(0, 10),
        DAILY_JOIN_LIMIT,
      )
      .toArray();
    if (!allowed.length) return new Response(null, { status: 429 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    const session: Session = {
      expires: Date.now() + SESSION_MS,
      last: 0,
      messages: 0,
    };
    pair[1].serializeAttachment(session);
    const snapshot = this.ctx.storage.sql
      .exec<{ sequence: number }>("SELECT sequence FROM state WHERE id=1")
      .one();
    pair[1].send(
      JSON.stringify({ kind: "snapshot", sequence: snapshot.sequence }),
    );
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(session.expires);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const state: Session = socket.deserializeAttachment();
    const now = Date.now();
    if (
      message !== "pulse" ||
      now >= state.expires ||
      state.messages >= 30 ||
      now - state.last < 1000
    ) {
      socket.close(1008, "Session or message limit");
      return;
    }
    state.last = now;
    state.messages++;
    socket.serializeAttachment(state);
    const row = this.ctx.storage.sql
      .exec<{ sequence: number }>(
        "UPDATE state SET sequence=(sequence+1)%1000000 WHERE id=1 RETURNING sequence",
      )
      .one();
    const payload = JSON.stringify({
      kind: "pulse",
      sequence: row.sequence,
      at: now,
    });
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(payload);
      } catch {
        peer.close(1011, "Connection closed");
      }
    }
  }
  webSocketClose(socket: WebSocket, code: number) {
    // These describe local closure conditions and cannot be sent in a close frame.
    socket.close([1005, 1006, 1015].includes(code) ? 1000 : code);
  }
  webSocketError(socket: WebSocket) {
    socket.close(1011, "Connection closed");
  }
  async alarm() {
    let next = Infinity;
    for (const socket of this.ctx.getWebSockets()) {
      const state: Session = socket.deserializeAttachment();
      if (state.expires <= Date.now()) socket.close(1000, "Session complete");
      else next = Math.min(next, state.expires);
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
  }
}
