// Authored examples, deliberately unrelated to any employer or live incident.
export const triageScenarios = {
  latency: {
    title: "The slow tail",
    question:
      "What could explain the slow tail, and what should be inspected next?",
    interpretation:
      "Database connection wait is a useful lead, not a confirmed cause. Inspect traces and pool measurements. A change happening after a deployment does not establish that the deployment caused it.",
    evidence:
      "Synthetic API: median latency 80 ms, p99 1,800 ms. Error rate steady at 0.2%. Database connection wait increased after a deployment. No trace samples have been checked yet.",
  },
  telemetry: {
    title: "The quiet dashboard",
    question:
      "What might be preventing telemetry delivery while application health checks pass?",
    interpretation:
      "HTTP 429 and a filling collector queue point towards throttling and back-pressure. Passing application checks do not prove telemetry is arriving. The source does not establish increased traffic or the destination's limiting policy.",
    evidence:
      "Synthetic collector: queue 85% full, dropped spans increasing, destination returns HTTP 429. Application health checks still pass. No change in application request rate. Only one telemetry destination is configured.",
  },
  replicas: {
    title: "Nowhere to land",
    question:
      "Why might the four pods remain pending despite low node CPU usage? Explain pod placement, not why HPA chose eight replicas.",
    interpretation:
      "The scheduler considers resource requests against node capacity. Low measured CPU does not mean new requests fit. HPA recommends a replica count; it does not add nodes or place pods. The pending pods' exact requests and other scheduling constraints still need inspection.",
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
