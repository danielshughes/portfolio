# AI triage review

## Approved design

Keep real, explicitly requested inference for fixed synthetic incidents. Display the authored scenario facts and a reviewed interpretation separately from generated suggestions. Require complete structured output: a tentative hypothesis, two proposed read-only checks and an unknown. Structural validation is not a factual verifier; never label a model answer a confirmed diagnosis.

Protect every deployed inference with server-side Turnstile validation before the atomic D1 reservation. Verify the exact environment hostname, the scenario-specific action and single-use token. Neither Origin nor a public site key is authentication. Keep the request body closed, accept exactly one allowlisted scenario, fix the model and generation settings in server code, and never send caller headers, tokens or identifiers to the model. Fail closed without retries or paid fallback.

The browser requests verification only on Run. Local preview explains the unavailable AI binding without spending quota. Keep native controls, readable error states, cancellation on scenario changes and inert text rendering. The separate agent/MCP example remains a labelled, browser-local host-policy simulation with no account access.

## Implementation plan

Execute inline with the executing-plans and test-driven-development skills. Existing release fixes remain separate; production stays gated during this review.

- [ ] Add server regression cases in `worker/triage.test.ts` and the real-runtime service suite. Check injected bodies, duplicate/encoded parameters, prototype names, forged origins, missing/replayed/wrong-host/wrong-action tokens, verifier failure, fixed inference inputs, incomplete model results and concurrent quota exhaustion. First reproduce the current failures using fake bindings only.
- [ ] Add `worker/turnstile.ts` for bounded Siteverify validation and `src/experiments/triage-answer.ts` for the shared response contract. Extend `worker/triage.ts` with verification before reservation, a public configuration response and explicit model-result validation. Keep source facts in `triage-scenarios.ts`.
- [ ] Add a lazy `src/experiments/turnstile.ts` client. Wire it into `live.ts`; render the validated answer with native elements and `textContent`. Update `LiveExperiments.astro`, styles and browser tests for facts, suggestions, verification, cancellation, errors, mobile reflow and inert malicious output.
- [ ] Provision separate free Turnstile widgets for development and production. Store secrets in 1Password, then GitHub environment secrets, and stream them into Worker secret bindings. Store only public site keys in Wrangler. Extend deployment checks and permit only the required challenge script/frame origins in CSP. No local inference bypass may enable deployed AI.
- [ ] Run bounded manual model evaluations for all scenarios, inspect the actual answers, and document limitations. Run the complete quality gate and secret scan. Update architecture, operations, experiment guidance, AGENTS and the private release record. Review and merge through develop, then verify the authenticated dev UI and Cloudflare metrics before considering production.

## Evaluation criteria

| Scenario | Reviewed interpretation | Reject as an evaluation failure |
| --- | --- | --- |
| The slow tail | Database connection wait is a useful lead for the slow tail; timing after a deployment does not establish causation. Inspect traces and pool/wait measurements. | Claiming the deployment is the confirmed cause, inventing query/trace findings or recommending changes as checks. |
| The quiet dashboard | HTTP 429 and a filling collector queue suggest destination throttling/back-pressure. Passing application probes do not establish telemetry delivery. | Inventing increased traffic, treating health checks as proof of telemetry health or claiming inspection already happened. |
| Nowhere to land | The scheduler places pods using resource requests against node capacity. Low measured CPU does not mean new requests fit. The HPA recommendation does not add nodes. | Blaming a too-low replica count, confusing HPA decisions with placement or treating low usage as proof of available requested capacity. |

Evaluate all scenarios after changing the model, prompt or schema. Check complete output, source consistency, tentative language, genuinely future read-only checks and meaningful unknowns. A small successful evaluation does not guarantee future generations. Automated fixtures verify the application boundary, not model intelligence.

## Threat model

Unauthenticated production visitors may inspect the public source and call endpoints directly. They may forge browser headers, send arbitrary bodies/queries and replay tokens. Turnstile reduces automated misuse but is not a per-person entitlement or a guarantee against determined abuse. The atomic daily limit bounds this application's attempted inference across concurrent calls and locations. Other projects and administrative inference share the account allowance and are outside that cap. Account and deployment credentials remain a separate access-control boundary.

## References

- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): server validation, single use, expiry, hostname and action checks.
- [Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/): free widgets and unlimited challenges.
- [Turnstile CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/): exact script/frame origins.
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/): structured output can still fail and needs validation.
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): account-wide neuron allowance and model-specific rates.
