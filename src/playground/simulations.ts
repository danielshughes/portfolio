export function desiredReplicas(
  current: number,
  utilisation: number,
  target: number,
) {
  if (
    !Number.isInteger(current) ||
    current < 1 ||
    !Number.isFinite(utilisation) ||
    utilisation < 0 ||
    !Number.isFinite(target) ||
    target <= 0
  )
    throw new RangeError("Invalid HPA input");
  const ratio = utilisation / target;
  const wanted =
    ratio >= 0.9 && ratio <= 1.1 ? current : Math.ceil(current * ratio);
  return Math.max(1, Math.min(12, wanted));
}

export interface ClusterSettings {
  load: number;
  cpuRequest: number;
  nodes: number;
  target: number;
}
export function planCluster(settings: ClusterSettings) {
  const { load, cpuRequest, nodes, target } = settings;
  if (
    !Number.isFinite(load) ||
    load < 0 ||
    load > 6000 ||
    !Number.isFinite(cpuRequest) ||
    cpuRequest < 100 ||
    cpuRequest > 1000 ||
    !Number.isInteger(nodes) ||
    nodes < 1 ||
    nodes > 4 ||
    target < 40 ||
    target > 80
  )
    throw new RangeError("Invalid cluster settings");
  // One fully observed CPU snapshot from two ready replicas. This is not the
  // complete HPA readiness, stabilisation or missing-metrics algorithm.
  const utilisation = (load / 2 / cpuRequest) * 100;
  const desired = desiredReplicas(2, utilisation, target);
  const used = Array<number>(nodes).fill(0);
  const assignments = Array.from({ length: desired }, () => {
    const candidates = used
      .map((cpu, node) => ({ cpu, node }))
      .filter((n) => n.cpu + cpuRequest <= 2000)
      .sort((a, b) => a.cpu - b.cpu || a.node - b.node);
    if (!candidates.length) return null;
    const node = candidates[0].node;
    used[node] += cpuRequest;
    return node;
  });
  return { ...settings, utilisation, desired, assignments, used };
}

export type Scenario = "read" | "approval" | "timeout" | "context";
export type Decision = "waiting" | "approve" | "deny";
export interface AgentStep {
  stage: string;
  text: string;
  calls: number;
  writeExecuted?: boolean;
}
export function agentTrace(
  scenario: Scenario,
  budget: number,
  decision: Decision,
): AgentStep[] {
  if (
    !Number.isInteger(budget) ||
    budget < 0 ||
    budget > 4 ||
    !["read", "approval", "timeout", "context"].includes(scenario) ||
    !["waiting", "approve", "deny"].includes(decision)
  )
    throw new RangeError("Invalid agent settings");
  const trace: AgentStep[] = [
    {
      stage: "context",
      text: "Task received: investigate stalled collection.",
      calls: 0,
    },
  ];
  let calls = 0;
  const add = (stage: string, text: string, writeExecuted?: boolean) =>
    trace.push({
      stage,
      text,
      calls,
      ...(writeExecuted ? { writeExecuted } : {}),
    });
  if (scenario === "context") {
    add(
      "stopped",
      "Service context is missing. Ask for clarification; no tools called.",
    );
    return trace;
  }
  add("agent", "Agent proposes a read-only service lookup.");
  function call(stage: string, text: string, write = false) {
    if (calls >= budget) {
      add("stopped", "Tool-call budget exhausted. Stop without another call.");
      return false;
    }
    calls++;
    add(stage, text, write);
    return true;
  }
  if (!call("tool", "Host allows the read. MCP tool request sent."))
    return trace;
  if (scenario === "timeout") {
    add(
      "timeout",
      "Tool timed out. Failed attempts still use the call budget.",
    );
    if (!call("tool", "One bounded retry, using the next budget slot."))
      return trace;
    add(
      "stopped",
      "Retry also timed out. Stop and report the unavailable tool.",
    );
    return trace;
  }
  add(
    "result",
    "Tool result: collection is stale; the process is still running.",
  );
  if (scenario === "approval") {
    if (calls >= budget) {
      add("stopped", "Tool-call budget exhausted before the proposed write.");
      return trace;
    }
    add(
      "approval",
      "Host policy requires approval before adding an incident note.",
    );
    if (decision === "waiting") return trace;
    if (decision === "deny") {
      add("stopped", "Write denied. No incident note was added.");
      return trace;
    }
    if (
      !call(
        "tool",
        "Simulated write approved and executed: add an incident note.",
        true,
      )
    )
      return trace;
  } else {
    if (!call("tool", "Read the recent collection events.")) return trace;
    add(
      "result",
      "Tool result: a collection error followed the latest change.",
    );
  }
  add("done", "Report the findings and their limits. No further tools needed.");
  return trace;
}
