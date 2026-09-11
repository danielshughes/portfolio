export const notes = [
  {
    id: "observability",
    label: "Observability & reliability",
    title: "Observability that holds up in operations.",
    teaser:
      "Telemetry collection, continuous profiling and production investigation. From Kubernetes resource sizing to whether a health check tells the truth.",
    tech: "Python / Grafana / OpenTelemetry",
    contribution:
      "Hands-on platform design and delivery across telemetry collection, continuous profiling and alerting, alongside production investigation and post-incident learning.",
    paragraphs: [
      "Telemetry and profiling services run on Kubernetes, with Helm delivery and environment-specific configuration. Resource sizing, rollout checks and recovery procedures are part of operating those platforms, not just getting them deployed.",
      "For continuous profiling, resource sizing followed measured load rather than a uniform allocation. Compaction needed its own allowance, validated through a controlled out-of-memory test. Alerting also needed context: a quiet collector is not necessarily a broken service when targets are shared across a fleet.",
      "A standalone Python storage exporter is one example. Separating it from an embedded implementation made bucket monitoring independently configurable. Hot reload allowed bucket changes without an image rebuild; readiness checked whether collection was still producing fresh data.",
    ],
    takeaway:
      "A process answering requests is not enough. The exporter reports unready when collection stops producing fresh data, even while the process remains alive.",
    diagram: ["Process running", "Collection stalls", "Readiness fails"],
    diagramCaption:
      "Health-check logic, simplified: a running process must not hide stale collection.",
  },
  {
    id: "ai-tooling",
    label: "AI tooling & developer experience",
    title: "Engineering the tools around the agent.",
    teaser:
      "Go MCP tooling, TypeScript agent extensions and a shared LLM proxy. Session continuity, useful integrations and the limits around them.",
    tech: "Go / TypeScript / MCP / OpenTelemetry",
    contribution:
      "Authored a Go incident-management MCP server on a shared MCP framework; built agent extensions and shared configuration, and operated the team's LLM proxy.",
    paragraphs: [
      "Agent extensions help carry context between sessions through compaction, recall and shared memory. Skills make procedures reusable; status information makes model fallbacks visible. A TypeScript bridge reuses existing MCP server definitions rather than introducing another configuration store.",
      "One MCP lookup exposed a performance problem: scanning upstream resources sequentially exceeded the proxy timeout. Bounded concurrency brought the lookup within that limit while keeping the number of simultaneous requests controlled. It was a service-engineering problem, not a prompting problem.",
      "The proxy adds provider routing, per-user rate limits and cost visibility. Status integrations expose rate-limit state inside the workflow. Shared skills cover procedures such as incident triage, onboarding and review, with verification kept as an explicit part of the work.",
    ],
    takeaway:
      "The model is one dependency. The interfaces, context and operating behaviour are engineering work too.",
    diagram: ["Engineer + context", "MCP + proxy", "Operational APIs"],
    diagramCaption:
      "Concurrent work shortens the scan; a bound limits how many upstream requests run at once.",
  },
  {
    id: "kubernetes-iac",
    label: "Kubernetes & infrastructure as code",
    title: "Kubernetes and IaC, through to production.",
    teaser:
      "Git-managed Kubernetes configuration, Helm delivery and Terraform state migration. Reviewed changes, explicit promotion and recovery paths.",
    tech: "Kubernetes / Terraform / Helm / GitOps / CI",
    contribution:
      "Delivered Git-managed Kubernetes configuration and declarative pipelines using shared Helm and CI patterns; led Terraform state migration with recovery procedures retained.",
    paragraphs: [
      "Kubernetes configuration is managed in Git across environments: ConfigMaps, service accounts and IAM resources. Helm applications use the team's shared archetype, with environment-specific values and staged promotion. Rollout verification checks Kubernetes status, health endpoints and metrics rather than stopping at a successful pipeline.",
      "Delivery work includes the awkward edges: immutable selectors during migrations, orphaned resources after moving to Helm, and render parameters overriding chart values. Each needs a migration or validation path, not another blind retry.",
      "Terraform ownership changes kept existing production resource IDs intact. State moved between roots and backends with recovery procedures retained. Shared modules cover recurring policy logic, while environment-specific configuration keeps promotion explicit.",
      "Profiling onboarding shows that practice in a small, concrete workflow. Teams declare targets in YAML; automation validates and enriches the configuration, creates required network-policy requests and publishes collector settings. Service classification comes from the asset system so conflicting declarations do not become conflicting telemetry.",
      "An authentication failure in that pipeline exposed a fail-open check. Error classification was tightened so authentication failures block progress, and the pipeline was re-run to process missing rules. Build review also caught a masked dependency-install failure: an unsuccessful install now fails the build.",
    ],
    takeaway:
      "The pipeline distinguishes authentication failures from transient service errors. That distinction determines when publication stops, instead of treating every failed check alike.",
    diagram: [
      "Declare + validate",
      "Check network rules",
      "Publish to collectors",
    ],
    diagramCaption:
      "Onboarding includes network-rule checks and explicit error handling, not just a successful render.",
  },
  {
    id: "technical-leadership",
    label: "Technical leadership & incident learning",
    title: "Build the capability, not just the change.",
    teaser:
      "Incident-management requirements, routing standards and vendor collaboration, alongside mentoring, implementation reviews and shared operational guidance.",
    tech: "Platform direction / Incident management / Mentoring",
    contribution:
      "Led incident-management technical direction and vendor collaboration; mentored engineers and established shared review, onboarding and verification practices.",
    paragraphs: [
      "Incident-management delivery brings requirements, severity mappings and alert routing into the same conversation with platform teams and vendor engineers. Common standards and onboarding material give participating teams a consistent route into the platform.",
      "Architecture discussions and implementation reviews sit alongside mentoring. Support includes working through technical decisions, reviewing changes and sharing the context needed to operate them. Production investigations and blameless postmortems feed back into code and recovery guidance.",
      "Runbooks, agent skills and reference material make that guidance reusable. Shared review and verification practices keep the operational checks close to implementation, including for work assisted by AI.",
    ],
    takeaway:
      "The reference material records how alert sources reach the incident platform, how severities map and how teams onboard. Those are decisions another engineer can inspect and build on.",
    diagram: ["Investigate + review", "Change the control", "Share + verify"],
    diagramCaption:
      "Findings feed into engineering changes and shared operational knowledge, then back into the next review.",
  },
] as const;

export function noteById(id: (typeof notes)[number]["id"]) {
  const note = notes.find((note) => note.id === id);
  if (!note) throw new Error(`Unknown note: ${id}`);
  return note;
}
