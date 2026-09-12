# Architecture

Astro renders the pages at build time. Cloudflare serves static assets without invoking application code; only `/api/*` reaches the Worker. Each environment has separate bindings, runtime credentials and storage. Development is Access-protected; approved production promotions target the public apex through an explicit release switch. Configuration is not proof of deployment.

## Request and delivery paths

```text
Feature PR -> read-only quality checks -> merge to develop
  -> checked commit rebuilt with development settings
  -> development GitHub environment secrets
  -> additive D1 migrations -> Wrangler asset + Worker upload

Browser -> HTTPS dev hostname -> Cloudflare Access
  -> static page/font/CSS/JS -> Workers Static Assets
  -> /api/* -> application Worker
       /radar        -> D1 cache -> KV snapshot -> Radar API
       /edge         -> allowlisted request.cf fields
       /health       -> D1 measurement history
       /triage-config -> public verification configuration
       /triage       -> Turnstile Siteverify -> D1 daily reservation -> Workers AI
       /stream       -> fixed, bounded NDJSON response
       /coordination -> SQLite Durable Object -> WebSocket peers

Cron (independent of visitors and Access)
  -> ASSETS HEAD -> D1 sample + retention
  -> fixed country Radar views -> validated KV bundle
```

Access applies to the whole development hostname, not merely HTML. Both Workers have no public `workers.dev` or version-preview URL. Production uses its own Worker and storage, with Cache API instead of development's D1 cache. There is no origin server, Pages project, R2 asset bucket or separate API domain.

## Code and configuration map

| Responsibility                                                     | Source of truth                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Page rendering, environment metadata, headers                      | `astro.config.mjs`, `src/layouts/BaseLayout.astro`, `src/security/`                            |
| Bindings, names, routes, schedules, rate namespaces, observability | `wrangler.jsonc`                                                                               |
| API routing and scheduled orchestration                            | `worker/index.ts`                                                                              |
| Radar validation and failure policy                                | `worker/radar.ts`                                                                              |
| Supported Radar view IDs and upstream dimensions                   | `src/experiments/radar-views.ts`                                                               |
| Environment cache selection and bounded D1 cache                   | `worker/radar-options.ts`, `worker/radar-cache.ts`                                             |
| Scheduled Radar bundles                                            | `worker/snapshots.ts`                                                                          |
| Edge, health, AI and shared room                                   | `worker/edge.ts`, `worker/health.ts`, `worker/triage.ts`, `worker/coordination.ts`             |
| Human verification and bounded streaming                           | `worker/turnstile.ts`, `worker/stream.ts`                                                      |
| Additive SQL schema                                                | `worker/migrations/`                                                                           |
| Browser service lifecycle and rendering                            | `src/experiments/live.ts`, `src/experiments/internet-map.ts`                                   |
| Health inspection, verification and streaming clients              | `src/experiments/health-chart.ts`, `src/experiments/turnstile.ts`, `src/experiments/stream.ts` |
| Shared gallery and previews                                        | `src/components/ExperimentCard.astro`, `LiveExperiments.astro`, `LivePreview.astro`            |
| Trusted deployment and docs-only filtering                         | `.github/workflows/ci.yml`, `scripts/deploy.mjs`, `scripts/ci-changes.mjs`                     |

The generated `worker/worker-configuration.d.ts` describes the actual Wrangler bindings. Regenerate it rather than maintaining a second handwritten environment interface. Resource identifiers in Wrangler are not credentials; secret values never belong there.

## Services

The [experiment behaviour contract](experiments.md) connects each interface to its model, motion lifecycle, data source and review checks.

| Endpoint             | Behaviour                                       | Boundary                                                                                                                       |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/api/radar`         | Validated Cloudflare Radar observations         | Fixed countries/views, cache and ingress/cold rate limits, no stale substitution                                               |
| `/api/edge`          | Allowlisted request metadata                    | No IP, precise location or persistence; private no-store response                                                              |
| `/api/health`        | Scheduled homepage response-header samples      | Fixed target, bounded indexed window, explicit coverage, not an uptime/SLO claim                                               |
| `/api/triage-config` | Public site key and local-mode indicator        | GET only, no secrets, no query or inference                                                                                    |
| `/api/triage`        | Real inference for authored synthetic scenarios | Same-origin POST, exact scenario, no body, single-use Turnstile validation, atomic daily reservation, fixed model/token limits |
| `/api/stream`        | Authored text sent in a real streaming response | POST only, no query/body, bounded frames, back-pressure, no upstream or storage                                                |
| `/api/coordination`  | Shared sequence via WebSockets                  | Same-origin admission, fixed room, SQLite state, bounded connections/messages/sessions and hibernation                         |

The original Kubernetes, MCP and visual models remain browser-local simulations. They do not call these services or become evidence of production-system experience.

All service requests pass a coarse, constant-key ingress limit. AI starts, stream starts and room upgrades also have separate per-path admission via `EXPERIMENT_STARTS`. These native limits are per Cloudflare location and eventually consistent, not global quotas or per-person authentication. AI reservations and room admissions have separate persisted global limits per environment. Invalid input and limiter failures do not fall through to a backend.

## Background work

One scheduled invocation collects a homepage asset HEAD measurement and one country's Radar views. Both jobs settle independently: a health storage failure does not prevent a valid Radar bundle being stored, and a Radar failure does not discard a successful health sample. The collector returns the selected country and accepted view IDs with a `complete`, `partial`, `empty` or `disabled` outcome. Partial collection stores only validated available views; empty collection writes nothing. Either attempted incomplete result makes the scheduled invocation fail after both jobs finish. Intentionally disabled Radar makes no admission, provider or storage calls and does not fail otherwise healthy work; an enabled collector without credentials reports `empty` with `missing_credentials`.

Unexpected binding/storage exceptions remain rejected jobs. Structured failure events contain fixed service/status/reason labels, the bounded country and accepted-view count, plus deployment version, never provider bodies or visitor identity. Upstream failures retain the foreground API's bounded backoff and cannot manufacture or renew missing observations.

KV stores bounded, validated Radar bundles; snapshots expire from eligibility without inventing new source timestamps. D1 stores the measurement history, a single daily AI-budget row and development's bounded response cache. Retention, request deadlines and application limits live in the modules listed above.

Production and development schedules are staggered in `wrangler.jsonc`; the configuration budget includes both environments. Configuration does not establish measured invocation or storage usage. Free allowances are account-wide and may be shared with other projects. AI has an atomic application cap in addition to Cloudflare's own quota; failures count against the cap. No paid fallback, R2, Queues or Workflows are required. See [operations](operations.md#free-tier-budget) for budget calculations and quota failure handling.

## Radar, end to end

The browser loads Traffic automatically, keeps country selection when changing views, and maintains a short document-memory cache. Speculative requests use a bounded queue, stop for unsuitable visibility/connection conditions and give foreground selection priority. That browser cache is an interaction optimisation, not a claim about upstream freshness. Failure, loading and a genuine missing reading are different states.

The Worker accepts GET with exactly the allowed country/view query. `src/experiments/radar-views.ts` owns the supported view IDs and summary dimensions, shared by API validation, cache keyspace, snapshot selection and exhaustively typed UI metadata. Unknown and inherited property names are rejected. Validation happens before outbound calls. Ingress admission is coarse and per Cloudflare location, using constant keys rather than visitor identifiers. The fixed cold-request limiter separately bounds upstream attempts.

The response path checks a successful cache entry, then a recent validated KV snapshot, then shared error backoff, before making upstream requests. Traffic uses a time series and reported disruptions; category views use their respective summaries. Only expected fields are returned. Requests have deadlines, reject redirects and enforce response-size/event-count limits. The Radar token goes only in the server-to-Cloudflare authorisation header. Browser cookies, Access credentials and caller-provided URLs are never forwarded upstream.

Development uses D1 because Cloudflare states: "For Workers fronted by Cloudflare Access, the Cache API is not currently available." [Cache API documentation](https://developers.cloudflare.com/workers/runtime-apis/cache/). Its keyspace is restricted to the configured country/view combinations and one backoff key. Request hostnames cannot create additional rows. Entries overwrite by primary key, expire logically, and never retain visitor data. Production uses location-local Cache API. Cache failures fail closed rather than silently flooding the upstream API.

`worker/radar.ts` owns the successful-response TTL and `MAX_BACKOFF_SECONDS`. Only the shared backoff key accepts the longer maximum, so a valid upstream Retry-After is honoured without extending the eligibility of cached observations.

Cron rotates through the country list deterministically. Before Radar work, an atomic D1 upsert claims the five-minute slot in the single-row `radar_collection` table. Concurrent, repeated or older slots are skipped before provider calls or KV writes, even when delivered in different locations with slightly different timestamps. A claim failure stops Radar work. The claim remains after partial or failed collection: this bounded demonstration waits for the next slot instead of repeating a possibly completed write. Health sampling settles independently.

Each admitted slot requests that country's views, validates the results, and writes at most one bundle to KV. Its invocation-local response cache coordinates backoff but cannot recycle an old edge response into a newly dated snapshot. A bundle can contain only the successful views. KV expiry and the stricter application freshness window are separate: stored data is not automatically eligible for display. Eventually consistent KV propagation can mean a fresh foreground request is still needed. Source update times remain unchanged.

Snapshot collection and reading share the UTF-8 encoded bundle limit `MAX_BUNDLE_BYTES` in `worker/snapshots.ts`. The collector preserves each accepted view intact; if a whole view cannot fit, it skips that view and continues with later views. It counts each serialised entry once, including its key and JSON separators, then joins accepted entries for one KV write. Skipped views yield the existing partial/empty outcomes, never truncated annotations or a successful unreadable bundle.

The atlas displays relative, country-normalised traffic, not absolute volumes, packet routes, uptime or inferred outages. The pulse marks selection. Reported disruptions retain their supplied scope. No reported events does not prove no outages. Cloudflare Radar attribution, CC BY-NC 4.0 and transformation notices remain visible; the owner's decision to use the data is not a vendor endorsement.

## Live experiments and trust boundaries

### Request metadata

`/api/edge` returns only explicitly selected `request.cf` values, such as country, colo and protocol, with optional timing when supplied. Missing metadata remains absent. It does not return or persist IP addresses, Access identity, coordinates or arbitrary request headers. Responses are private and non-cacheable. This is an observation at the serving edge, not a traceroute or a claim of precise visitor location.

Local-preview requests return `mode: local` with null connection fields. The local command injects `LOCAL_PREVIEW:true` because Wrangler can rewrite the loopback URL to the configured route. Deployment configuration keeps the flag false. Wrangler's simulated `request.cf` values are not observations of the visitor's route. Local preview labels this limitation explicitly.

### Scheduled measurements

The scheduled probe uses `ASSETS.fetch` with a fixed same-environment homepage HEAD request, timeout and no redirects. It does not depend on production being live and needs no permanent Access service credential. Success means HTTP 200 with an HTML content type from the asset binding.

Elapsed time measures that binding's response headers, not DNS, TLS, public routing, Access login, body transfer or browser rendering. Failed attempts remain failed samples; missing schedule slots remain gaps. The timestamp is normalised to the schedule slot, allowing retries to use `INSERT OR IGNORE`. Indexed queries return a bounded last-day window and explicit expected sample coverage. Each tick also prunes expired history. The chart is not an independent availability monitor or an SLO.

Interval, window and expected-count definitions are shared in `src/experiments/health-model.ts`. The [health interface contract](experiments.md#worker-backed-experiments) owns validation, gap rendering, dated inspection and table behaviour.

### AI triage

The original agent/MCP simulation remains browser-local and scripted. The separate triage experiment performs real Workers AI inference only after an explicit Run action. Authored facts and the reviewed interpretation remain distinct from model suggestions. [Experiments](experiments.md#worker-backed-experiments) owns the exact layout, request-state and motion contract; [AI review](ai-review.md) owns correctness and threat evaluation.

POST requires the same Origin, exactly one allowlisted scenario and an empty body. A bounded first body read distinguishes a genuinely empty workerd stream from supplied content without parsing visitor text. The server fixes the model, prompt, token limit and schema. It never forwards caller headers, verification tokens, URLs or identity to the model.

The browser loads the Turnstile SDK only on Run. `/api/triage-config` returns a public site key, not a secret. The token is sent in `cf-turnstile-response`, not a URL. `worker/turnstile.ts` validates it against Siteverify before budget reservation, requiring success, the exact request hostname and the scenario-specific action. Siteverify enforces expiry and single use. Validation is bounded, refuses redirects, has no retry/cache, and fails closed. CSP permits only the required challenge script/frame origin; the secret is a server binding. A site key and Origin header are not authentication.

Local-preview requests are rejected explicitly before reserving budget because the supported local command disables remote bindings. No scripted substitute is returned.

D1 atomically reserves one attempt against a single daily row before inference. Concurrent requests cannot exceed the application cap; timeouts and failed inference still consume their reservation. The model, output-token cap, deadline and temperature are fixed in `worker/triage.ts`. JSON-mode output must contain one hypothesis, two distinct proposed checks and an unknown, within bounded text sizes. Invalid structure, a reported non-stop finish or output at the token ceiling is rejected without displaying a partial answer. DOM rendering uses inert text, not model-supplied HTML. Validation establishes completeness of the display contract, not factual truth. The model has no tools and cannot execute actions. A daily limit or provider outage produces a clear failure, not another paid provider. The UTC date resets eligibility on the next reservation; no reset Cron is needed. See [AI review and evaluation](ai-review.md).

### Response streaming

`worker/stream.ts` owns the fixed newline-delimited JSON sequence, frame limits and intended pacing. Pull-based production honours back-pressure and cancellation; no detached timer keeps producing after cancellation. Buffering and slow readers can change arrival timing. Nothing is stored, no provider is called, and neither text nor frame count comes from visitors. The [streaming interface contract](experiments.md#worker-backed-experiments) owns client validation, cancellation and received-frame presentation.

### Shared coordination

`/api/coordination` admits same-origin WebSocket upgrades to one named room per environment. The Durable Object uses SQLite for a bounded sequence, hibernating sockets and serialised per-connection limits. Joining sends a typed `snapshot` with the current sequence, without inventing a new event. Its fixed `pulse` message increments state and broadcasts a typed `pulse` with sequence and timestamp to connected peers. It is not chat and stores no visitor identity or text.

Connection count, session duration, messages per session and send spacing are bounded in `worker/coordination.ts`. A single SQLite `join_budget` row atomically caps accepted joins per UTC day, preventing repeated reconnects from resetting the overall accepted-work allowance. It survives hibernation and uses additive table creation without touching the existing sequence. Rejected requests still consume platform resources; this is not immunity to denial of service. An alarm closes expired sessions, allowing idle hibernation instead of an always-running timer. [Experiments](experiments.md#worker-backed-experiments) owns browser connection lifetime and the distinction between illustrative previews, state snapshots and received-event motion.

The close handler maps reserved local statuses to a valid normal-close frame rather than echoing them. In particular, an abrupt network disconnect reports `1006`, which cannot be transmitted as a WebSocket close code. Runtime regression tests cover reserved statuses and valid peer codes, plus a real transport termination through the Durable Object, its callback outcome and a successful rejoin/pulse afterwards.

## Persistence and privacy

| Storage               | Contents                                             | Lifetime / bound                               | Not stored                                   |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Static Assets         | Generated public HTML, CSS, JS, fonts, illustrations | Versioned deployment                           | Runtime credentials or private sourcebook    |
| KV `RADAR_SNAPSHOTS`  | Validated country bundles                            | Fixed country keys; TTL plus eligibility check | Visitor data, raw upstream errors            |
| D1 `radar_cache`      | Public Radar payloads and error backoff              | Fixed keys; bounded TTL, overwrite             | Request hostnames, identities, secrets       |
| D1 `health_samples`   | Slot, status, elapsed milliseconds, success flag     | Retained time window; indexed primary key      | Request/response bodies or caller data       |
| D1 `ai_budget`        | UTC day and reserved count                           | Single row                                     | Prompts, generated answers, visitor identity |
| Durable Object SQLite | Bounded room sequence and daily join allowance       | One row per purpose                            | Chat, identity, visitor IP                   |
| WebSocket attachments | Expiry, last send, message count                     | Session lifetime                               | Credentials or personal data                 |

Cloudflare itself processes network metadata and Access identity as the platform operator. Its native invocation logs can retain request headers, including IP addresses. The edge endpoint excludes IPs from its response and application storage; this is not a site-wide promise that the hosting platform stores none. Native telemetry has separate retention and account quotas. Do not dump full request objects, headers, binding configuration responses or provider exceptions into application logs.

Native traces are lightly sampled and correlated with deployment metadata. Application log messages exclude credentials and visitor identifiers. Query parameters are redacted from native request logs. Avoid treating sampling as a hard account-wide event cap.

## Delivery

The required quality job always reports. Recognised docs-only changes retain redacted secret scanning but skip expensive checks and deployment; site content is code for this purpose. Workflow runs queue per ref without automatic cancellation, preventing a docs-only push from replacing pending code delivery. Pull requests have no deployment credentials. See [queue behaviour and validation](operations.md#normal-deployment) for the bounded queue and linter compatibility exception.

Trusted `develop` pushes deploy through the development GitHub environment after quality passes. Production's `main` path additionally requires `PRODUCTION_DEPLOY_ENABLED=true` in both the job condition and deployment script. Publication is approved through reviewed `develop` to `main` promotions; a later hold requires disabling the switch. The script checks event, repository, branch, environment and production origin, applies D1 migrations, then streams the Radar and Turnstile secrets into Wrangler. A failed migration prevents upload. Keep migrations additive so older Worker versions remain compatible during rollback.

Development uses `dev.danhughes.uk`, protected by hostname-based Access; production uses `danhughes.uk`. Worker and preview subdomains remain disabled. A successful upload is not proof of working Access, scheduled collection or AI: verify the actual URLs and service behaviour after release. [Operations](operations.md) describes the release and recovery checks.

Credentials live in 1Password, environment-scoped GitHub secrets and Worker secret bindings, never in the public bundle. GitHub Actions does not run the 1Password CLI.
