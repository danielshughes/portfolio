# Cloudflare operations

Development is the only authorised release target. Production is on hold. This guide describes the checked-in implementation and how to verify a deployment; dated release evidence must identify what actually ran, rather than treating this guide as proof that every service is live.

## Configuration ownership

`wrangler.jsonc` owns Worker names, environment bindings, routes, schedules, rate-limit namespaces, migrations and sampling. Do not make undocumented dashboard changes to values that Wrangler will overwrite. Zone security, Access applications/policies, API credentials, GitHub environments and branch protections are managed separately. Their exact private IDs, vault references, verification evidence and recovery versions belong in the owner's private operational record, not a public README.

| Setting                                 | Development                                                  | Prepared production                          |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Git branch / GitHub environment         | `develop` / `development`                                    | `main` / `production`                        |
| Custom hostname                         | `dev.danhughes.uk`                                           | `danhughes.uk`                               |
| Access                                  | Owner-only hostname application                              | Public site if later approved                |
| Search indexing                         | Meta/header noindex; robots disallow; no production metadata | Production build metadata only when approved |
| Worker, KV, D1, DO and Radar credential | Development-specific                                         | Separate production resources                |
| Radar response cache                    | D1                                                           | Cache API                                    |
| Scheduled asset probe                   | Development ASSETS binding                                   | Production ASSETS binding                    |
| Deploy enablement                       | Trusted checked development push                             | Explicit switch required; currently held     |

No-index directives are not security. Access is the actual development boundary. The two environments do not share room state, budgets, data or runtime credentials. Account-wide quotas are still shared.

### Logs and traces

The shared `observability` block explicitly enables invocation logs and traces, with independent sampling rates and query-string redaction. Both named environments inherit it. Read the current rates from `wrangler.jsonc`; `tests/deployment.test.mjs` guards the intended configuration. Do not copy a dashboard-generated snippet without comparing it: `traces.enabled: false` disables tracing even when logs are enabled, and a later deployment applies the checked-in settings.

These settings control Cloudflare's deployed telemetry, not a local trace collector. After deployment, confirm the resolved Worker settings and inspect an actual sampled invocation or trace. Empty results at low traffic can reflect sampling, so an enabled toggle alone is not functional evidence. Native tracing needs no extra SDK. Keep application logs free of secrets and visitor identifiers; query redaction does not sanitise arbitrary console output.

Cloudflare's [invocation logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#invocation-logs) retain request/response metadata and can include request-address headers. The edge API excludes IPs from its response and application stores; do not broaden that into a promise of no platform-level IP retention. Inspect native telemetry through allowlisted fields or aggregate checks, never by printing raw request headers or authenticated events.

Cloudflare's [tracing feature documentation](https://developers.cloudflare.com/workers/observability/traces/#limits--pricing) owns beta availability and the transition to a shared log/span allowance. Check it alongside [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#pricing) before changing rates. Sampling reduces expected volume but does not enforce an account-wide cap or authorise a paid plan.

## Initial provisioning and domain security

1. Confirm the account remains on the intended Free Workers/Access plans. Do not enable a paid fallback or alter unrelated R2 subscriptions.
2. Inspect the existing zone before changing anything. Confirm authoritative nameservers, active zone, DNSSEC, certificate coverage and CAA compatibility with Cloudflare's certificate issuers.
3. Use strict TLS, modern minimum TLS, automatic HTTPS redirection and certificate transparency notifications. Do not blindly copy private-service geography restrictions or challenges onto a portfolio. A rule that works for a private application may block a recruiter or an API/WebSocket request.
4. Create a hostname-based Access application for development with an explicit owner allow policy and the existing one-time PIN identity provider. Keep it out of the launcher if it is not needed there. No bypass policy and no allow-everyone rule. Preserve a recovery admin route in Cloudflare's own dashboard, not an unprotected website hostname.
5. Provision environment-specific KV and D1 resources. Add their identifiers to the matching Wrangler environment. SQLite Durable Object creation is controlled by the Wrangler migration, not a manually invented namespace ID. AI is a binding, not a client credential.
6. Create least-privilege deployment and Radar Read credentials, save them in 1Password with genuine DATE expiry fields, and populate the matching GitHub environment through stdin. Never print, put in argv or commit values.
7. Configure branch-restricted GitHub environments and protected branch checks. Keep production's enable variable absent or false. Apply D1 migrations before the first Worker deployment.
8. Deploy through CI, verify the new protected hostname, then retire an old development route and only its matching temporary Access/zone exceptions. Do not remove old access protection while its route still serves the Worker.

HSTS should follow verified HTTPS/certificate behaviour, with deliberate subdomain/preload scope. A null MX and deny-all sender policy mean the domain does not receive or send mail; revise those before introducing mail. These are separate zone decisions, not settings in Wrangler.

## Credentials and rotation

| Credential / value                      | Stored in                                                            | Consumer                     | Must not reach                           |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------------- | ---------------------------------------- |
| Account identifier                      | GitHub environment setting and private record                        | Wrangler                     | Not secret, but avoid unnecessary copies |
| Scoped deploy API token                 | 1Password; `CLOUDFLARE_API_TOKEN` environment secret                 | Trusted deploy job           | Browser, PR job, application logs        |
| Radar Read token                        | 1Password; `RADAR_API_TOKEN` GitHub secret and Worker secret binding | Server-side Radar request    | Browser, generated assets, Git           |
| Temporary Access QA service credentials | 1Password, short expiry                                              | In-process smoke checks only | Website code, ordinary CI, transcript    |
| Owner Access session                    | Browser / Cloudflare Access                                          | Access edge                  | Radar upstream or application storage    |

GitHub Actions does not use `op`. The owner's authorised workstation transfers credentials from 1Password directly into GitHub secret stdin. Wrangler receives runtime secrets through a real OS pipe using `--secrets-file /dev/stdin`; secrets are excluded from the consumer's environment where no longer required. Node child stdin can be a socket rather than a real pipe, so preserve the tested shell-pipeline implementation.

The deploy token needs relevant zone read/routes permissions and account Workers deployment, KV read, D1 migration and AI binding permissions. Account-level Workers permission is broader than a single script: document that residual scope rather than claiming per-Worker isolation. Do not give CI Access administration, unrelated R2 rights or the global API key.

To rotate: create the replacement with the same reviewed scope, save and re-read it without displaying it, update only the matching GitHub environment, deploy through the trusted path, verify the real API, then revoke the old token. If a deployment fails, do not revoke the known-working token prematurely. Check Cloudflare's actual expiry against the vault DATE, not a free-text note. A committed secret requires immediate rotation even if the commit is later removed.

## Local development and tests

Use the Node version declared by `package.json`. `npm run dev` serves Astro. Build assets and apply local migrations before starting the local Worker; Astro proxies `/api` including WebSocket upgrades to that Worker. Keep local `.dev.vars` ignored, and never use real credentials in automated tests.

```sh
npm ci
npm run build:dev
npx wrangler d1 migrations apply HISTORY --env development --local
npm run dev:worker
```

In another terminal, run `npm run dev`. After the Worker starts, `npm run dev:sample` invokes its real scheduled handler once using Wrangler's loopback-only `/cdn-cgi/local/scheduled` endpoint. It uses the current time, never historical timestamps or a fabricated backfill. Reload the health experiment to see the check; repeated runs within one schedule slot do not manufacture extra samples. Local Cron is not automatic. The command also attempts the bounded Radar snapshot collection using any already-provisioned local Radar token, but does not load credentials from 1Password or authenticate.

Local D1, KV and room state belong to Wrangler's ignored local state, not the remote resources whose identifiers appear in the configuration. Rebuild assets after changing pages before measuring the local ASSETS response. Local checks are not proof of the deployed hostname's health.

The local command also injects `LOCAL_PREVIEW:true`. This is a non-secret local behaviour flag, not an authorisation control. Wrangler can rewrite a loopback request to the configured custom-domain origin, so hostname checks alone are insufficient to identify its simulated metadata. Every checked-in deployment environment keeps the flag `false`; do not override it during deployment. Restart the local Worker after changing its command-line options.

Radar additionally requires the development `RADAR_API_TOKEN` binding. With `secrets.required` in the configuration, Wrangler can consume that named secret from the launched process environment, or an ignored local vars file. Prefer the authorised vault-to-process flow; never paste its value into a command argument, public file or terminal output. An in-memory credential does not survive stopping that process. Without it, Radar is unavailable even if other local experiments work. Automated tests keep their separate fake upstream and must not inherit this credential.

Cloudflare states: "There is no current local simulation for Workers AI." [Local development](https://developers.cloudflare.com/workers/local-development/). The local-only command disables remote bindings. Loopback AI requests return an explicit local-unavailable response before reserving budget; real inference must be verified on the authenticated deployed development site. The edge experiment also suppresses Wrangler's simulated connection metadata on loopback. Browser-local simulations and real local WebSockets work without either remote capability. Never substitute a scripted AI answer or label Wrangler's placeholder metadata as a real connection.

`npm run quality` checks formatting, ESLint, Astro and Worker types, content/model/API/static/environment tests, real workerd storage and WebSockets, build output and browser suites. Runtime tests apply every ordered SQL migration to disposable databases, use an explicitly fake token and intercept outbound requests. They cannot prove the real provider or Access policy works. Browser tests cover native keyboard operation, reduced motion, no-script output, light/dark modes, enlarged text, stable geometry and iPhone-sized WebKit views. An emulated viewport is not a physical iPhone Safari test or a VoiceOver test.

CI runs every configured browser. An explicit local browser subset must be reported as such. After workflow changes run `npm run lint:workflows`; after binding changes run `npm run types:worker`. Audit dependencies, run the redacted secret scan and inspect generated assets for private content. Dry-run output and test artefacts belong outside the checkout.

## Normal deployment

1. Work on a feature branch and open a PR against `develop`.
2. The read-only required quality job always reports. Recognised documentation-only changes retain file classification and redacted secret scanning, but skip dependency/browser installation, the expensive suite and deployment; site copy and unknown files still require quality. Workflow-level PR path filters are intentionally avoided because required checks could remain pending.
3. Merge only after the actual required checks pass. Do not substitute a local result for failing CI or bypass protection.
4. A trusted `develop` push builds that exact merge commit using development settings. The deploy job uses only its branch-restricted environment secrets. PR runs cannot deploy. Workflow runs queue per ref without automatic cancellation, so a later documentation-only push cannot replace a pending code run. This deliberately also retains queued PR runs; inspect and cancel an obsolete PR run manually if needed, without cancelling protected-branch delivery.
5. The script validates repository, event and branch; applies additive remote SQL migrations; uploads the Worker, static assets and runtime Radar secret; and applies routes, bindings, migrations and Cron configuration.
6. Read the deployment result and perform the live checklist below. Record commit SHA, Action run, Worker version, checks, schedule evidence and remaining limits in the release record.

Production remains disabled in the workflow and deployment script unless `PRODUCTION_DEPLOY_ENABLED` is exactly `true`. Enabling it requires fresh owner approval, a reviewed `develop` to `main` promotion, correct production environment secrets and production metadata checks. Do not set the switch merely to make a test or Action pass.

GitHub's [concurrency queue](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) uses `queue: max`; it is bounded, and arrival order is not a guarantee of commit order. Check the final deployed SHA after a burst of pushes. The pinned actionlint release lacks that field, so `.github/actionlint.yaml` suppresses only its exact unknown-key diagnostic for this workflow. `tests/ci-workflow.test.mjs` validates the queue/cancellation combination. Remove that exception when the linter supports the field; all other workflow and shell diagnostics remain enforced.

## Live verification checklist

- Anonymous HTML, assets, APIs and WebSocket upgrades on development are rejected or directed to Access, not served as public portfolio content. Confirm there are no usable `workers.dev`, preview or old-hostname bypasses.
- Owner sign-in works. For automated checks, create a short-lived Access service token, store it in 1Password, and attach only a Service Auth policy to this development app. Use its headers in memory, never shell argv. Revoke the policy/token after the release checks. Machine Service Auth success does not prove owner OTP delivery.
- Authenticated `/`, `/notes/` and `/experiments/` return the correct content; scripts, fonts and styles load. Check noindex/robots, security headers, absence of production canonical/sitemap and current single-word navigation.
- Radar returns observed data for every allowed country and tab. Check source dates, category/series validation, cache reuse and failure/retry behaviour. Do not replace a failed live request with a fixture. Wait for real scheduled KV evidence before claiming Cron works.
- Edge returns only the allowed metadata and `private, no-store`. No IP or Access identity is returned.
- Health starts with an honest empty window, then receives an actual scheduled sample. Check status, elapsed time, sample coverage, fixed target and measurement type. Verify the stored rows and bounded query, not merely the schedule's presence.
- One explicitly triggered AI scenario returns bounded text from the real binding. Confirm the daily reservation increments and invalid input/cross-origin requests are denied. Avoid repeatedly consuming the quota while debugging.
- Two authenticated WebSocket clients first receive the current sequence as a `snapshot`, then matching `pulse` events after an explicit send. Verify invalid messages close, sessions expire and the browser clears state on disconnect. Check full-path travel and receiver arrival only for live pulses, including the separate off-screen diagram gate. Do not mistake preview motion or the initial snapshot for a new server event.
- Inspect deployment-correlated exceptions, CPU time, subrequests, storage and quota usage. A successful HTTP status alone is not proof of correct data or sustainable resource use.
- Recheck mobile/desktop, both palettes, refreshed Radar viewport, fixed gallery frames and accessible controls through the deployed page.

## Free-tier budget

The account has other workloads. The application's caps bound its own work; they do not reserve an isolated share of Cloudflare's allowances. Verify the linked vendor limits and actual account usage before changing cadence, model or limits. Do not turn on usage-based fallback.

| Resource            | Design bound and verification                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static Assets       | Served asset-first; no application invocation for ordinary page assets. [Billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)                                                                                                                                                                                                                              |
| Worker CPU/requests | Free currently allows 100,000 requests/day and 10 ms CPU per HTTP invocation. Waiting on I/O is not CPU time. Inspect real invocation CPU and failures; a timeout or per-location limiter is not a CPU guarantee. [Limits](https://developers.cloudflare.com/workers/platform/limits/)                                                                                                                           |
| Cron and Radar      | The configured five-minute development cadence projects 288 ticks/day, at most five upstream Radar calls and one KV write per tick. Country rotation comes from the model list. This is a configuration budget, not evidence that a deployed version has received Cron events. Do not count prepared production as active.                                                                                       |
| KV                  | The configured cadence projects at most 288 writes/day for development, or 576 if both environments are later approved and run. This is below Free's 1,000 writes/day before other account use, not proof of deployed usage. Reads are separate. Snapshot TTL is two hours; eligibility is one hour. [KV limits](https://developers.cloudflare.com/kv/platform/limits/)                                          |
| D1                  | Free currently includes 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Health retention is seven days, the displayed window one day, AI budget one row, cache keys finite. Native ingress is per location, not a global D1 quota. [D1 pricing and allowance behaviour](https://developers.cloudflare.com/d1/platform/pricing/)                                                        |
| Workers AI          | Free currently includes 10,000 neurons/day. The application permits 50 attempts per environment/day with a fixed small model and 180 output-token cap. Failed attempts count. Neurons depend on the model's input/output rates and other account use; inspect usage rather than equating requests with neurons. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)             |
| Durable Objects     | Use Free-compatible SQLite storage and WebSocket hibernation. One bounded room, 12 connections, two-minute sessions, 30 messages/session and at least one second between sends. These are workload limits, not an exemption from account request/storage quotas. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)                                                  |
| Logs/traces         | Sampled native logs and traces with deployment correlation and query-string redaction. Sampling is not a hard daily cap. Review current retention, beta availability and shared account ingestion limits before enabling or increasing it. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [traces](https://developers.cloudflare.com/workers/observability/traces/) |

If a free quota is reached, show unavailable/limited state and investigate. Reduce the workload or disable the optional feature; do not switch the account to Paid, invent telemetry or route around a provider limit. The source modules and Wrangler configuration are the canonical application limits; update this budget calculation whenever those values change.

## Failure diagnosis

| Symptom                        | First checks                                                                                        | Do not do                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Access login loop / 403        | Hostname app, owner policy, IdP, session, service-token action and expiry                           | Add allow-everyone or expose workers.dev                                    |
| Page works, `/api` fails       | Active version, bindings, secret presence, migration state, per-path response and correlated errors | Print secrets or return full provider errors                                |
| Radar fails behind Access      | Development D1 cache/migration, token validity, snapshot age, upstream backoff                      | Use unsupported Cache API or silently show samples                          |
| Country/view unavailable       | Exact source response status, limits, stored bundle/view and eligibility                            | Treat every gap as an outage                                                |
| Empty health history           | Actual Cron delivery, ASSETS result, SQL schema and latest slot                                     | Seed fabricated successful readings                                         |
| AI 429                         | Daily reserved counter/date, coarse ingress and account allowance                                   | Reset counters to evade a limit                                             |
| AI 503                         | Binding/model availability and fixed request validation, one bounded real probe                     | Forward arbitrary user prompts or enable paid fallback                      |
| WebSocket rejected             | Same Origin, Access session, upgrade headers, room limits                                           | Remove origin checks or use Worker-level Access incompatible with this path |
| Deploy failed                  | Exact job/step, branch/environment guards, credential scope, additive migration errors              | Force push, bypass checks or deploy production as a workaround              |
| UI flash / geometry regression | Served version, no-script DOM, pre-module layout, actual mobile WebKit                              | Hide the entire page until JavaScript finishes                              |

## Rollback and data recovery

Before release, record the previous deployed Worker version and custom-domain IDs. If the new version fails, use the previous compatible version through Wrangler's rollback command or the dashboard, then re-run live smoke checks. Inspect `npx wrangler rollback --help` for the installed CLI and explicitly select development; never assume the default environment is safe.

Worker rollback does not rewind KV, D1, Access, DNS, Cron or credentials. Keep SQL migrations additive and old readers compatible. Retain the new tables during diagnosis. Use D1's recovery facilities only after reviewing the affected data and obtaining approval for destructive restoration. Durable Object migrations can restrict rollback to earlier versions: inspect the migration history before relying on a pre-DO version as the recovery path. A forward fix may be safer than deleting a namespace.

Do not delete production resources simply because publication is held. Do not automatically drop databases, clear all KV, remove Access, or restore an old public development route. Change the minimum affected configuration and record it. After recovery, update code, private state records and instructions so the next deploy does not reintroduce the fault.
