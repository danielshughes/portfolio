// Authored examples, deliberately unrelated to any employer or live incident.
export const triageScenarios = {
  latency: {
    title: "The slow tail",
    question:
      "What could explain the slow requests, and what should be checked next?",
    interpretation:
      "Database wait is a lead, not a confirmed cause. Check traces and pool measurements. A change after deployment does not prove causation.",
    evidence:
      "Synthetic API: median latency 80 ms, p99 1,800 ms. Error rate steady at 0.2%. Database connection wait increased after a deployment. No trace samples have been checked yet.",
  },
  telemetry: {
    title: "The quiet dashboard",
    question:
      "Why might telemetry be dropping while application health checks still pass?",
    interpretation:
      "HTTP 429 responses and a collector queue at 85% point to throttling or back-pressure. Passing application checks do not prove telemetry is arriving. The evidence does not show higher traffic or the destination's limit.",
    evidence:
      "Synthetic collector: queue 85% full, dropped spans increasing, destination returns HTTP 429. Application health checks still pass. No change in application request rate. Only one telemetry destination is configured.",
  },
  replicas: {
    title: "Nowhere to land",
    question:
      "Why are four pods pending when node CPU usage is low? Explain placement, not why HPA chose eight.",
    interpretation:
      "The scheduler compares resource requests with node capacity. Low measured CPU does not mean requests fit. HPA chooses a target but does not place pods or add nodes. Pending requests and scheduling constraints still need checking.",
    evidence:
      "Synthetic Kubernetes workload: HPA recommends 8 replicas, 4 ready and 4 pending. Events report insufficient CPU. Node usage is low but existing resource requests reserve most allocatable CPU. No memory or affinity information is available.",
  },
} as const;

export type TriageScenario = keyof typeof triageScenarios;
export function isTriageScenario(
  value: string | null,
): value is TriageScenario {
  return value !== null && Object.hasOwn(triageScenarios, value);
}
