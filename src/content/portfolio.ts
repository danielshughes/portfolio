export type EvidenceEntry = Readonly<{
  heading: string;
  need: string;
  contribution: string;
  outcome: string;
}>;

export type ExternalLink = Readonly<{
  label: "GitHub" | "LinkedIn" | "Contact";
  href: string;
}>;

export type PortfolioContent = Readonly<{
  headline: "Observability & SRE Leader";
  support: string;
  signal: string;
  evidence: readonly [EvidenceEntry, EvidenceEntry, EvidenceEntry];
  focus: readonly string[];
  contact: string;
  links: readonly ExternalLink[];
}>;

export const portfolioContent = {
  headline: "Observability & SRE Leader",
  support:
    "Hands-on technical leadership across observability, reliability and cloud platforms.",
  signal:
    "I lead through hands-on engineering: making operational signals useful, infrastructure changes repeatable and incident learning durable, while helping other engineers understand, adopt and improve the result.",
  evidence: [
    {
      heading: "Reliability through observability",
      need: "Operational telemetry is only valuable when it makes failure visible, diagnosable and recoverable.",
      contribution:
        "I work across collection, profiling and alerting paths: clarifying health semantics, investigating production failures and converting root causes into code changes, tests, post-incident learning and practical runbooks.",
      outcome:
        "The result is clearer failure modes and repeatable recovery guidance for operators. I keep the outcome qualitative where availability or recovery-time improvement has not been measured.",
    },
    {
      heading: "Infrastructure and automation",
      need: "Repeated configuration, state changes and delivery hand-offs create avoidable operational risk.",
      contribution:
        "I build declarative pipelines and infrastructure-as-code workflows that render configuration, compare intended state and keep changes reviewable. The same approach carries into readiness checks, release verification and documented rollback or recovery paths.",
      outcome:
        "Manual processes become repeatable engineering controls that are easier to inspect, maintain and recover. I describe that operational benefit without inventing time-saved or adoption figures.",
    },
    {
      heading: "Technical leadership and enablement",
      need: "Reliable practices have limited value if they remain with one engineer or one team.",
      contribution:
        "I combine hands-on delivery with mentoring, shared standards, onboarding guidance, runbooks and reusable operational tooling. Recent work includes AI-assisted interfaces designed around authentication, rate limits, scoped access and live verification.",
      outcome:
        "The result is capability that other engineers can apply, inspect and improve. This is technical leadership and enablement, not a claim of line-management authority or AI/ML security expertise.",
    },
  ],
  focus: [
    "Site reliability engineering",
    "Infrastructure and cloud platforms",
    "Observability and alerting",
    "Incident investigation and learning",
    "Infrastructure as code and delivery automation",
    "Technical leadership and engineering enablement",
  ],
  contact:
    "If you are working on reliable platforms, observability or infrastructure engineering, you can inspect the source, connect with me on LinkedIn or start a conversation there.",
  links: [
    {
      label: "GitHub",
      href: "https://github.com/danielshughes/portfolio",
    },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/dan-hughes-796098108/",
    },
    {
      label: "Contact",
      href: "https://www.linkedin.com/in/dan-hughes-796098108/",
    },
  ],
} as const satisfies PortfolioContent;
