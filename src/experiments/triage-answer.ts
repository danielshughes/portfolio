export interface TriageAnswer {
  hypothesis: string;
  checks: [string, string];
  unknown: string;
}
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

// This checks the display contract, not the truth of generated statements.
export function isTriageAnswer(value: unknown): value is TriageAnswer {
  const text = (part: unknown) =>
    typeof part === "string" &&
    part.trim().length >= 12 &&
    part.length <= 700 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(part);
  return (
    isRecord(value) &&
    Object.keys(value).sort().join(",") === "checks,hypothesis,unknown" &&
    text(value.hypothesis) &&
    text(value.unknown) &&
    Array.isArray(value.checks) &&
    value.checks.length === 2 &&
    value.checks.every(text) &&
    value.checks[0] !== value.checks[1]
  );
}
