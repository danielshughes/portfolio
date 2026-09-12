import worker from "../../worker/index.ts";
export { CoordinationRoom } from "../../worker/coordination.ts";

// Advance the real disposable database immediately before collection's claim,
// reproducing a newer Cron dispatch between the old read and the write.
export default {
  ...worker,
  queue(batch, env, ctx) {
    return worker.queue(
      batch,
      {
        ...env,
        HISTORY: {
          prepare(sql) {
            if (!sql.includes("INSERT INTO radar_collection"))
              return env.HISTORY.prepare(sql);
            return {
              bind(...args) {
                const statement = env.HISTORY.prepare(sql).bind(...args);
                return {
                  async first() {
                    await env.HISTORY.prepare(
                      "UPDATE radar_dispatch SET slot=slot+1 WHERE id=1",
                    ).run();
                    return statement.first();
                  },
                };
              },
            };
          },
        },
      },
      ctx,
    );
  },
};
