import {
  isTriageScenario,
  triageScenarios,
} from "../src/experiments/triage-scenarios.ts";
import {
  apiJson,
  isLocalPreview,
  sameOrigin,
  emptyRequestBody,
} from "./http.ts";
import { isRecord, isTriageAnswer } from "../src/experiments/triage-answer.ts";
import { verifyHuman } from "./turnstile.ts";

export const DAILY_AI_LIMIT = 20;
export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const AI_OUTPUT_TOKENS = 512;
export const TRIAGE_INSTRUCTION =
  "Analyse only the supplied synthetic scenario and its question. Return JSON matching the schema: one tentative hypothesis, exactly two read-only checks proposed for a human to perform next, and what remains unknown. Keep the answer under 120 words. Use British English, no em dashes. Do not repeat the facts. Do not invent measurements, observations or completed checks. You have no tools or system access. Do not give commands or propose changes. Correlation with a deployment is not proof of cause. Missing evidence is unknown, not evidence of absence. A hypothesis must say may, might or could. Do not infer that input volume, span size or rate-limit configuration changed. For Kubernetes, distinguish HPA recommendations from scheduler placement: low actual CPU usage does not guarantee unreserved CPU requests fit; scheduling errors do not explain why HPA chose a replica count. Compare node allocatable CPU, existing pods' CPU requests and pending pods' CPU requests, not CPU limits. Pending pods are not running. Keep unmeasured causes unknown.";
export const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    hypothesis: { type: "string" },
    checks: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: { type: "string" },
    },
    unknown: { type: "string" },
  },
  required: ["hypothesis", "checks", "unknown"],
};

export function triageConfiguration(request: Request, env: Env) {
  if (request.method !== "GET")
    return apiJson({ error: "method_not_allowed" }, 405);
  if (new URL(request.url).search)
    return apiJson({ error: "invalid_query" }, 400);
  return apiJson({
    local: isLocalPreview(request, env),
    siteKey: env.TURNSTILE_SITE_KEY || null,
  });
}

export async function triage(request: Request, env: Env) {
  if (request.method !== "POST")
    return apiJson({ error: "method_not_allowed" }, 405);
  if (!sameOrigin(request))
    return apiJson({ error: "origin_not_allowed" }, 403);
  const url = new URL(request.url),
    scenario = url.searchParams.get("scenario");
  if (
    !isTriageScenario(scenario) ||
    [...url.searchParams].length !== 1 ||
    !(await emptyRequestBody(request))
  )
    return apiJson({ error: "invalid_scenario" }, 400);
  // --local disables remote bindings. Do not spend reservations or present
  // Wrangler's unavailable provider as a transient model failure.
  if (isLocalPreview(request, env))
    return apiJson({ error: "local_inference_unavailable" }, 503);
  const token = request.headers.get("cf-turnstile-response");
  if (!token || token.length > 2048 || /\s/.test(token))
    return apiJson({ error: "verification_required" }, 403);
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY)
    return apiJson({ error: "verification_unavailable" }, 503);
  try {
    if (
      !(await verifyHuman(
        token,
        env.TURNSTILE_SECRET_KEY,
        url.hostname,
        `triage-${scenario}`,
      ))
    )
      return apiJson({ error: "verification_failed" }, 403);
  } catch {
    return apiJson({ error: "verification_unavailable" }, 503);
  }
  // One conditional write on a single-row table. Reserve before inference and
  // count failed calls too. The free-budget estimate for both environments is
  // tested separately; other account workloads still share the same allowance.
  const day = new Date().toISOString().slice(0, 10);
  const reserved = await env.HISTORY.prepare(
    `INSERT INTO ai_budget (id,day,used) VALUES (1,?,1)
    ON CONFLICT(id) DO UPDATE SET day=excluded.day, used=CASE WHEN ai_budget.day=excluded.day THEN ai_budget.used+1 ELSE 1 END
    WHERE ai_budget.day<>excluded.day OR ai_budget.used<? RETURNING used`,
  )
    .bind(day, DAILY_AI_LIMIT)
    .first<{ used: number }>();
  if (!reserved) return apiJson({ error: "daily_budget_reached" }, 429);
  const started = Date.now();
  try {
    const result: unknown = await env.AI.run(
      AI_MODEL,
      {
        messages: [
          {
            role: "system",
            content: TRIAGE_INSTRUCTION,
          },
          {
            role: "user",
            content: `${triageScenarios[scenario].evidence}\nQuestion: ${triageScenarios[scenario].question}`,
          },
        ],
        max_tokens: AI_OUTPUT_TOKENS,
        temperature: 0.1,
        response_format: { type: "json_schema", json_schema: TRIAGE_SCHEMA },
      },
      { signal: AbortSignal.timeout(15000) },
    );
    if (
      !isRecord(result) ||
      !isTriageAnswer(result.response) ||
      !isRecord(result.usage) ||
      !Number.isSafeInteger(result.usage.completion_tokens) ||
      Number(result.usage.completion_tokens) <= 0 ||
      Number(result.usage.completion_tokens) >= AI_OUTPUT_TOKENS ||
      !Number.isSafeInteger(result.usage.prompt_tokens) ||
      Number(result.usage.prompt_tokens) < 1 ||
      Number(result.usage.prompt_tokens) > 4096 ||
      (result.choices !== undefined &&
        (!Array.isArray(result.choices) ||
          result.choices.length !== 1 ||
          !isRecord(result.choices[0]) ||
          result.choices[0].finish_reason !== "stop"))
    )
      return apiJson({ error: "model_response_incomplete" }, 503);
    return apiJson({
      scenario,
      model: AI_MODEL,
      answer: result.response,
      usage: {
        inputTokens: result.usage.prompt_tokens,
        outputTokens: result.usage.completion_tokens,
      },
      elapsedMs: Date.now() - started,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return apiJson({ error: "model_unavailable" }, 503);
  }
}
