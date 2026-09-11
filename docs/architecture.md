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
       /triage       -> D1 daily reservation -> Workers AI
       /coordination -> SQLite Durable Object -> WebSocket peers

Cron (independent of visitors and Access)
  -> ASSETS HEAD -> D1 sample + retention
  -> fixed country Radar views -> validated KV bundle
```

Access applies to the whole development hostname, not merely HTML. Both Workers have no public `workers.dev` or version-preview URL. Production uses its own Worker and storage, with Cache API instead of development's D1 cache. There is no origin server, Pages project, R2 asset bucket or separate API domain.

## Code and configuration map

| Responsibility                                                     | Source of truth                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Page rendering, environment metadata, headers                      | `astro.config.mjs`, `src/layouts/BaseLayout.astro`, `src/security/`                 |
| Bindings, names, routes, schedules, rate namespaces, observability | `wrangler.jsonc`                                                                    |
| API routing and scheduled orchestration                            | `worker/index.ts`                                                                   |
| Radar validation and failure policy                                | `worker/radar.ts`                                                                   |
| Environment cache selection and bounded D1 cache                   | `worker/radar-options.ts`, `worker/radar-cache.ts`                                  |
| Scheduled Radar bundles                                            | `worker/snapshots.ts`                                                               |
| Edge, health, AI and shared room                                   | `worker/edge.ts`, `worker/health.ts`, `worker/triage.ts`, `worker/coordination.ts`  |
| Additive SQL schema                                                | `worker/migrations/`                                                                |
| Browser service lifecycle and rendering                            | `src/experiments/live.ts`, `src/experiments/internet-map.ts`                        |
| Shared gallery and previews                                        | `src/components/ExperimentCard.astro`, `LiveExperiments.astro`, `LivePreview.astro` |
| Trusted deployment and docs-only filtering                         | `.github/workflows/ci.yml`, `scripts/deploy.mjs`, `scripts/ci-changes.mjs`          |

The generated `worker/worker-configuration.d.ts` describes the actual Wrangler bindings. Regenerate it rather than maintaining a second handwritten environment interface. Resource identifiers in Wrangler are not credentials; secret values never belong there.

## Services

The [experiment behaviour contract](experiments.md) connects each interface to its model, motion lifecycle, data source and review checks.

| Endpoint            | Behaviour                                       | Boundary                                                                                                        |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/radar`        | Validated Cloudflare Radar observations         | Fixed countries/views, cache and ingress/cold rate limits, no stale substitution                                |
| `/api/edge`         | Allowlisted request metadata                    | No IP, precise location or persistence; private no-store response                                               |
| `/api/health`       | Scheduled homepage response-header samples      | Fixed target, bounded indexed window, explicit coverage, not an uptime/SLO claim                                |
| `/api/triage`       | Real inference for authored synthetic scenarios | Same-origin POST, no visitor prompt/body, atomic daily reservation, fixed model/token limits, inert text output |
| `/api/coordination` | Shared sequence via WebSockets                  | Same-origin admission, fixed room, SQLite state, bounded connections/messages/sessions and hibernation          |

The original Kubernetes, MCP and visual models remain browser-local simulations. They do not call these services or become evidence of production-system experience.

## Background work

One scheduled invocation collects a homepage asset HEAD measurement and one country's Radar views. Both jobs run independently: a health storage failure does not prevent the Radar job. Rejected jobs log a service label and cause the invocation to report incomplete collection. Upstream Radar failures follow the same bounded error/backoff policy as foreground requests and never produce fictitious snapshots.

KV stores bounded, validated Radar bundles; snapshots expire from eligibility without inventing new source timestamps. D1 stores the measurement history, a single daily AI-budget row and development's bounded response cache. Retention, request deadlines and application limits live in the modules listed above.

The prepared production schedule is staggered from development, but it does not run until that Worker is deployed. Free allowances are account-wide and may be shared with other projects. AI has an atomic application cap in addition to Cloudflare's own quota; failures count against the cap. No paid fallback, R2, Queues or Workflows are required. See [operations](operations.md#free-tier-budget) for budget calculations and quota failure handling.

## Radar, end to end

The browser loads Traffic automatically, keeps country selection when changing views, and maintains a short document-memory cache. Speculative requests use a bounded queue, stop for unsuitable visibility/connection conditions and give foreground selection priority. That browser cache is an interaction optimisation, not a claim about upstream freshness. Failure, loading and a genuine missing reading are different states.

The Worker accepts GET with exactly the allowed country/view query. Validation happens before outbound calls. Ingress admission is coarse and per Cloudflare location, using constant keys rather than visitor identifiers. The fixed cold-request limiter separately bounds upstream attempts.

The response path checks a successful cache entry, then a recent validated KV snapshot, then shared error backoff, before making upstream requests. Traffic uses a time series and reported disruptions; category views use their respective summaries. Only expected fields are returned. Requests have deadlines, reject redirects and enforce response-size/event-count limits. The Radar token goes only in the server-to-Cloudflare authorisation header. Browser cookies, Access credentials and caller-provided URLs are never forwarded upstream.

Development uses D1 because Cloudflare states: "For Workers fronted by Cloudflare Access, the Cache API is not currently available." [Cache API documentation](https://developers.cloudflare.com/workers/runtime-apis/cache/). Its keyspace is restricted to the configured country/view combinations and one backoff key. Request hostnames cannot create additional rows. Entries overwrite by primary key, expire logically, and never retain visitor data. Production's prepared path uses location-local Cache API. Cache failures fail closed rather than silently flooding the upstream API.

Successful response TTL is capped at one hour. Only the shared backoff key accepts the longer maximum defined by `MAX_BACKOFF_SECONDS`, currently one day, so a valid upstream Retry-After is honoured without extending the eligibility of cached observations.

Cron rotates through the country list deterministically. Each tick requests that country's views, validates the results, and writes at most one bundle to KV. Its invocation-local response cache coordinates backoff but cannot recycle an old edge response into a newly dated snapshot. A bundle can contain only the successful views. KV expiry and the stricter application freshness window are separate: stored data is not automatically eligible for display. Eventually consistent KV propagation can mean a fresh foreground request is still needed. Source update times remain unchanged.

The atlas displays relative, country-normalised traffic, not absolute volumes, packet routes, uptime or inferred outages. The pulse marks selection. Reported disruptions retain their supplied scope. No reported events does not prove no outages. Cloudflare Radar attribution, CC BY-NC 4.0 and transformation notices remain visible; the owner's decision to use the data is not a vendor endorsement.

## Live experiments and trust boundaries

### Request metadata

`/api/edge` returns only explicitly selected `request.cf` values, such as country, colo and protocol, with optional timing when supplied. Missing metadata remains absent. It does not return or persist IP addresses, Access identity, coordinates or arbitrary request headers. Responses are private and non-cacheable. This is an observation at the serving edge, not a traceroute or a claim of precise visitor location.

Local-preview requests return `mode: local` with null connection fields. The local command injects `LOCAL_PREVIEW:true` because Wrangler can rewrite the loopback URL to the configured route. Deployment configuration keeps the flag false. Wrangler's simulated `request.cf` values are not observations of the visitor's route. Local preview labels this limitation explicitly.

### Scheduled measurements

The scheduled probe uses `ASSETS.fetch` with a fixed same-environment homepage HEAD request, timeout and no redirects. It does not depend on production being live and needs no permanent Access service credential. Success means HTTP 200 with an HTML content type from the asset binding.

Elapsed time measures that binding's response headers, not DNS, TLS, public routing, Access login, body transfer or browser rendering. Failed attempts remain failed samples; missing schedule slots remain gaps. The timestamp is normalised to the schedule slot, allowing retries to use `INSERT OR IGNORE`. Indexed queries return a bounded last-day window and explicit expected sample coverage. Each tick also prunes expired history. The chart is not an independent availability monitor or an SLO.

The browser labels that returned window with its start and end dates and gives the latest sample's full date. The window is exactly one day; interval, window and expected-count constants are shared in `src/experiments/health-model.ts`. The browser rejects invalid, out-of-order or out-of-window samples before drawing. The history is a snapshot loaded on opening, not a continuously advancing live monitor. Lines join only adjacent successful slots; failures and missing intervals break the line.

### AI triage

The original agent/MCP simulation remains browser-local and scripted. The separate triage card performs real Workers AI inference only after an explicit Run action. POST requires the same Origin, an allowlisted scenario and no visitor prompt. The model receives a fixed instruction plus authored synthetic evidence, never employer data or browser identity.

Local-preview requests are rejected explicitly before reserving budget because the supported local command disables remote bindings. No scripted substitute is returned. Changing the selected scenario cancels the previous request without allowing its cancellation message or answer to overwrite the new scenario.

D1 atomically reserves one attempt against a single daily row before inference. Concurrent requests cannot exceed the application cap; timeouts and failed inference still consume their reservation. The model, output-token cap, deadline and temperature are fixed in `worker/triage.ts`. Output is bounded and rendered as inert text. The model has no tools, cannot execute actions and must not be treated as a confirmed diagnosis. A daily limit or provider outage produces a clear failure, not another paid provider. The UTC date resets eligibility on the next reservation; no reset Cron is needed.

### Shared coordination

`/api/coordination` admits same-origin WebSocket upgrades to one named room per environment. The Durable Object uses SQLite for a bounded sequence, hibernating sockets and serialised per-connection limits. Joining sends a typed `snapshot` with the current sequence, without inventing a new event. Its fixed `pulse` message increments state and broadcasts a typed `pulse` with sequence and timestamp to connected peers. It is not chat and stores no visitor identity or text.

Connection count, session duration, messages per session and send spacing are bounded in `worker/coordination.ts`. An alarm closes expired sessions, allowing idle hibernation instead of an always-running timer. The browser closes connections when the card closes, leaves view or the tab becomes hidden, clears the displayed sequence, and does not reconnect in a loop. A separate stage-visibility gate suppresses animation when only the controls remain on-screen. Preview animation is illustrative; only received live pulses animate the opened diagram, travelling across the complete path with a receiver highlight. Snapshots do not animate.

## Persistence and privacy

| Storage               | Contents                                             | Lifetime / bound                               | Not stored                                   |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Static Assets         | Generated public HTML, CSS, JS, fonts, illustrations | Versioned deployment                           | Runtime credentials or private sourcebook    |
| KV `RADAR_SNAPSHOTS`  | Validated country bundles                            | Fixed country keys; TTL plus eligibility check | Visitor data, raw upstream errors            |
| D1 `radar_cache`      | Public Radar payloads and error backoff              | Fixed keys; bounded TTL, overwrite             | Request hostnames, identities, secrets       |
| D1 `health_samples`   | Slot, status, elapsed milliseconds, success flag     | Retained time window; indexed primary key      | Request/response bodies or caller data       |
| D1 `ai_budget`        | UTC day and reserved count                           | Single row                                     | Prompts, generated answers, visitor identity |
| Durable Object SQLite | Bounded room sequence                                | Single row                                     | Chat, identity, visitor IP                   |
| WebSocket attachments | Expiry, last send, message count                     | Session lifetime                               | Credentials or personal data                 |

Cloudflare itself processes network metadata and Access identity as the platform operator. Its native invocation logs can retain request headers, including IP addresses. The edge endpoint excludes IPs from its response and application storage; this is not a site-wide promise that the hosting platform stores none. Native telemetry has separate retention and account quotas. Do not dump full request objects, headers, binding configuration responses or provider exceptions into application logs.

Native traces are lightly sampled and correlated with deployment metadata. Application log messages exclude credentials and visitor identifiers. Query parameters are redacted from native request logs. Avoid treating sampling as a hard account-wide event cap.

## Delivery

The required quality job always reports. Recognised docs-only changes retain redacted secret scanning but skip expensive checks and deployment; site content is code for this purpose. Workflow runs queue per ref without automatic cancellation, preventing a docs-only push from replacing pending code delivery. Pull requests have no deployment credentials. See [queue behaviour and validation](operations.md#normal-deployment) for the bounded queue and linter compatibility exception.

Trusted `develop` pushes deploy through the development GitHub environment after quality passes. Production's prepared `main` path additionally requires `PRODUCTION_DEPLOY_ENABLED=true` in both the job condition and deployment script. Keep it absent or false until the owner explicitly approves publication. The script checks event, repository, branch, environment and production origin, applies D1 migrations, then streams the Radar secret into Wrangler. A failed migration prevents upload. Keep migrations additive so older Worker versions remain compatible during rollback.

Development is configured for `dev.danhughes.uk`, protected by hostname-based Access. Production's prepared target is `danhughes.uk`, not an active release promise. Worker and preview subdomains remain disabled. A successful upload is not proof of working Access, scheduled collection or AI: verify the actual URLs and service behaviour after release. [Operations](operations.md) describes the release and recovery checks.

Credentials live in 1Password, environment-scoped GitHub secrets and Worker secret bindings, never in the public bundle. GitHub Actions does not run the 1Password CLI.
