import { CoordinationRoom as ProductionRoom } from "../../worker/coordination.ts";

// Seed boundary conditions in the isolated runtime only. No diagnostic route
// or budget override is exposed by the deployed Worker.
export class CoordinationRoom extends ProductionRoom {
  async fetch(request) {
    if (new URL(request.url).pathname === "/seed") {
      this.ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS join_budget (id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, used INTEGER NOT NULL)",
      );
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO join_budget VALUES(1,?,?)",
        request.headers.get("fixture-day"),
        Number(request.headers.get("fixture-used")),
      );
      return new Response(null, { status: 204 });
    }
    if (new URL(request.url).pathname === "/budget")
      return Response.json(
        this.ctx.storage.sql
          .exec("SELECT day, used FROM join_budget WHERE id=1")
          .toArray(),
      );
    return super.fetch(request);
  }
}
export default {
  fetch(request, env) {
    return env.COORDINATION.getByName("fixture-budget").fetch(request);
  },
};
