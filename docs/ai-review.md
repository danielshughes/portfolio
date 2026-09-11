# AI triage review

## Approved design

Keep real, explicitly requested inference for fixed synthetic incidents. Display the authored scenario facts and a reviewed interpretation separately from generated suggestions. Require complete structured output: a tentative hypothesis, two proposed read-only checks and an unknown. Structural validation is not a factual verifier; never label a model answer a confirmed diagnosis.

Protect every deployed inference with server-side Turnstile validation before the atomic D1 reservation. Verify the exact environment hostname, the scenario-specific action and single-use token. Neither Origin nor a public site key is authentication. Keep the request body closed, accept exactly one allowlisted scenario, fix the model and generation settings in server code, and never send caller headers, tokens or identifiers to the model. Fail closed without retries or paid fallback.

The browser requests verification only on Run. Local preview explains the unavailable AI binding without spending quota. Keep native controls, readable error states, cancellation on scenario changes and inert text rendering. The separate agent/MCP example remains a labelled, browser-local host-policy simulation with no account access.

## Interface and checks

The AI incident lab stays open at full width below the compact cards, with no Explore gate. Its shallow artwork spans the frame at all widths and uses shared visibility/reduced-motion gates. Idle motion is decorative; verifying/waiting labels follow real browser callbacks, and completed/failed states settle. Never imply background inference or reveal model internals. Before an answer, the second column contains the prepared interpretation, not an empty answer placeholder. A complete model suggestion appears before the collapsed reference, alongside the facts on desktop and beneath them on mobile. Use the shared lilac palette, typography and spacing. Empty verification containers must not reserve rows.

Copy must distinguish the fictional, fixed scenario from a fresh model response and the prepared reference. Describe output checks as suggestions, never checks performed by the model. The interface accepts only the scenario choice, not visitor-written facts. Avoid instructions that imply a free-text prompt or access to live systems; keep verification and model-response waiting explicit.

The fixed streaming demo completes the compact collection. Its received-text area starts with an honest short empty state, not blank reserved space. The health chart gains a pointer readout and one native range control for keyboard/touch inspection of actual recorded checks, including failures. Missing intervals remain gaps, not invented selectable points.

`tests/triage.test.mjs` and the real-runtime service suite cover injected bodies, duplicate/encoded parameters, prototype names, forged origins, missing/replayed/wrong-host/wrong-action tokens, verifier failure, fixed inference inputs, incomplete model results and concurrent quota exhaustion. They use fake bindings only. Browser regressions cover lazy verification, inert rendering, cancellation, always-open layout, narrow screens and enlarged text.

Facts and reviewed interpretations live in `src/experiments/triage-scenarios.ts`; the structured response contract is shared between client and server. Public verification configuration contains no secret. Separate environment widgets and the secret-delivery procedure are described in [operations](operations.md#credentials-and-rotation). A passing fixture does not establish that a deployed binding or real challenge works: verify those through the actual development UI before production promotion.

## Evaluation criteria

| Scenario            | Reviewed interpretation                                                                                                                                              | Reject as an evaluation failure                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| The slow tail       | Database connection wait is a useful lead for the slow tail; timing after a deployment does not establish causation. Inspect traces and pool/wait measurements.      | Claiming the deployment is the confirmed cause, inventing query/trace findings or recommending changes as checks.                       |
| The quiet dashboard | HTTP 429 and a filling collector queue suggest destination throttling/back-pressure. Passing application probes do not establish telemetry delivery.                 | Inventing increased traffic, treating health checks as proof of telemetry health or claiming inspection already happened.               |
| Nowhere to land     | The scheduler places pods using resource requests against node capacity. Low measured CPU does not mean new requests fit. The HPA recommendation does not add nodes. | Blaming a too-low replica count, confusing HPA decisions with placement or treating low usage as proof of available requested capacity. |

Evaluate all scenarios after changing the model, prompt or schema. Check complete output, source consistency, tentative language, genuinely future read-only checks and meaningful unknowns. A small successful evaluation does not guarantee future generations. Automated fixtures verify the application boundary, not model intelligence.

## Threat model

Unauthenticated production visitors may inspect the public source and call endpoints directly. They may forge browser headers, send arbitrary bodies/queries and replay tokens. Turnstile reduces automated misuse but is not a per-person entitlement or a guarantee against determined abuse. The atomic daily limit bounds this application's attempted inference across concurrent calls and locations. Other projects and administrative inference share the account allowance and are outside that cap. Account and deployment credentials remain a separate access-control boundary.

### Independent safeguards

| Risk                                | Application enforcement                                                      | Cloudflare enforcement                                                                | Failure check                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Arbitrary prompts or proxying       | Exact scenario, empty body, fixed provider/model/settings and no tools       | Server-only AI binding; no exposed account credential                                 | Extra/encoded parameters, lying body length and prompt headers cannot alter model input      |
| Automated/replayed inference        | Validate token outcome, hostname and action before reservation               | Managed Turnstile, expiring single-use Siteverify tokens                              | Missing, duplicate, wrong-host/action, redirected and malformed verifier results fail closed |
| Expensive repeated work             | Atomic daily AI attempts and room admissions, including failed inference     | Native per-location ingress/start limits and account Free allowance                   | Concurrent exhaustion and unavailable rate bindings cannot trigger unbounded work            |
| Streaming/room abuse                | Fixed frames/message, bounded response/session/count, cancellation, one room | Hibernation, native ingress and platform limits                                       | Invalid frames, rejected upgrades, abrupt closure and reconnect admission checks             |
| Visitor-supplied script             | Validated typed responses rendered with text nodes                           | CSP, nosniff and framing restrictions on served assets/API responses                  | Script-shaped output remains inert; source and generated assets are scanned                  |
| Environment or credential crossover | Separate config, budgets and storage; trusted branch deploy guards           | Owner-only development Access, separate secrets/widgets, disabled worker/preview URLs | Wrong-host verification fails; PR jobs have no deployment secrets                            |

Rate limits are coarse and per location. Neither a public site key nor Origin is a secret. An attacker can still consume rejected-request capacity or the accepted demo allowance; this design bounds damage and fails unavailable rather than claiming the service cannot be abused.

## Model evaluation, 11 September 2026

The original small model produced a truncated answer and confused HPA recommendations with scheduling capacity. Candidate checks found that a model accepting ordinary text did not necessarily support the required JSON schema, and another used its completion budget without returning a usable answer. Llama 3.3 70B FP8 fast was selected for concise schema output, with a lower application attempt budget to offset its higher neuron rate.

A bounded direct Cloudflare evaluation of the final checked-in instruction, questions and schema returned complete, structurally valid responses for every scenario with stop finishes. The slow-tail response identified connection waits as a tentative lead and proposed trace/pool inspection. The telemetry response proposed destination throttling and checks of rate configuration and queue policy, without asserting an observed cause. The Kubernetes response compared node allocatable CPU with existing and pending pod requests, without claiming extra HPA replicas add capacity or using CPU limits as placement capacity. The observed completion lengths were 49, 57 and 54 tokens, costing about 57 neurons in total. This verifies those responses, not every future generation or the deployed browser/Turnstile path.

The reviewed interpretation remains essential: suggestions can be vague, incomplete in their reasoning or wrong despite valid JSON. Rejecting malformed/cut-off output is not a factual verifier. Do not claim model correctness solely from unit fixtures, a successful HTTP response or this small evaluation.

## References

- [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): server validation, single use, expiry, hostname and action checks.
- [Turnstile Free plan](https://developers.cloudflare.com/turnstile/plans/): free widgets and unlimited challenges.
- [Turnstile CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/): exact script/frame origins.
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/): structured output can still fail and needs validation.
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): account-wide neuron allowance and model-specific rates.
