// Authored examples, deliberately unrelated to any employer or live incident.
export const triageScenarios = {
  latency: {
    title: "The slow tail",
    evidence:
      "Synthetic API: median latency 80 ms, p99 1,800 ms. Error rate steady at 0.2%. Database connection wait increased after a deployment. No trace samples have been checked yet.",
  },
  telemetry: {
    title: "The quiet dashboard",
    evidence:
      "Synthetic collector: queue 85% full, dropped spans increasing, destination returns HTTP 429. Application health checks still pass. No change in application request rate. Only one telemetry destination is configured.",
  },
  replicas: {
    title: "Nowhere to land",
    evidence:
      "Synthetic Kubernetes workload: HPA target 8 replicas, 4 ready and 4 pending. Events report insufficient CPU. Node usage is low but existing resource requests reserve most allocatable CPU. No memory or affinity information is available.",
  },
} as const;

export type TriageScenario = keyof typeof triageScenarios;
export function isTriageScenario(
  value: string | null,
): value is TriageScenario {
  return value !== null && Object.hasOwn(triageScenarios, value);
}
