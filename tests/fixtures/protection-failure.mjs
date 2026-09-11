import worker from "../../worker/index.ts";
export { CoordinationRoom } from "../../worker/coordination.ts";

// Fault injection is isolated to the test harness, never a deployed endpoint.
export default {
  fetch(request, env, ctx) {
    const binding = request.headers.get("fixture-failure");
    return worker.fetch(
      request,
      {
        ...env,
        [binding]: {
          limit() {
            throw new Error("Fixture binding unavailable");
          },
        },
      },
      ctx,
    );
  },
};
