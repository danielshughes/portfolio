import { test } from "node:test";
import assert from "node:assert/strict";
import { desiredReplicas, planCluster, agentTrace } from "./simulations.ts";

test("HPA respects tolerance and replica bounds", () => {
  assert.equal(desiredReplicas(2, 120, 60), 4);
  assert.equal(desiredReplicas(2, 62, 60), 2);
  assert.equal(desiredReplicas(2, 66, 60), 2);
  assert.equal(desiredReplicas(2, 54, 60), 2);
  assert.equal(desiredReplicas(2, 66.01, 60), 3);
  assert.equal(desiredReplicas(2, 0, 60), 1);
  assert.equal(desiredReplicas(2, 2000, 60), 12);
  assert.throws(() => desiredReplicas(2, NaN, 60));
});
test("CPU requests constrain placement independently of desired replicas", () => {
  const small = planCluster({
    load: 4000,
    cpuRequest: 500,
    nodes: 1,
    target: 60,
  });
  assert.equal(small.desired, 12);
  assert.equal(small.assignments.filter((n) => n !== null).length, 4);
  const bigger = planCluster({
    load: 4000,
    cpuRequest: 500,
    nodes: 3,
    target: 60,
  });
  assert.equal(bigger.assignments.filter((n) => n !== null).length, 12);
  for (let n = 0; n < 3; n++)
    assert.ok(bigger.assignments.filter((i) => i === n).length * 500 <= 2000);
  assert.deepEqual(
    planCluster({ load: 4000, cpuRequest: 500, nodes: 3, target: 60 }),
    bigger,
  );
  assert.throws(() =>
    planCluster({ load: 100, cpuRequest: 0, nodes: 1, target: 60 }),
  );
});
test("a simulated write needs explicit host approval", () => {
  const waiting = agentTrace("approval", 3, "waiting");
  assert.equal(waiting.at(-1)?.stage, "approval");
  assert.equal(
    waiting.some((s) => s.writeExecuted),
    false,
  );
  assert.equal(
    agentTrace("approval", 3, "deny").some((s) => s.writeExecuted),
    false,
  );
  assert.equal(
    agentTrace("approval", 3, "approve").filter((s) => s.writeExecuted).length,
    1,
  );
});
test("tool budgets include failed attempts and missing context prevents tool use", () => {
  for (const scenario of ["read", "approval", "timeout", "context"] as const) {
    for (let budget = 0; budget <= 4; budget++) {
      const trace = agentTrace(scenario, budget, "approve");
      assert.ok(trace.every((s) => s.calls <= budget));
    }
  }
  assert.equal(agentTrace("context", 3, "waiting").at(-1)?.calls, 0);
  assert.equal(agentTrace("read", 0, "waiting").at(-1)?.stage, "stopped");
  assert.equal(agentTrace("timeout", 1, "waiting").at(-1)?.calls, 1);
  assert.equal(agentTrace("timeout", 1, "waiting").at(-1)?.stage, "stopped");
  assert.equal(agentTrace("read", 3, "waiting").at(-1)?.stage, "done");
});
