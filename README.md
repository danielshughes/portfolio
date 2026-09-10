# Dan Hughes Portfolio

Public source for Dan Hughes's personal engineering portfolio: observability, Kubernetes, infrastructure as code, AI tooling and a few side quests.

The homepage introduces the work and the person. Notes make room for engineering decisions; Experiments makes room to experiment. No employment timeline, invented impact figures or exhaustive technology inventory.

## Project principles

- **Fast to understand:** a clear homepage and a separate route for technical depth.
- **Evidence before assertion:** published claims must be supportable and appropriately scoped.
- **Static by default:** essential content works without client-side JavaScript.
- **Accessible and resilient:** semantic HTML, progressive enhancement and a WCAG 2.2 AA target.
- **Technology with a purpose:** infrastructure choices should improve delivery, security, operability or the reader's experience.
- **Public by design:** code and deployment configuration are inspectable; credentials and private working material are not.

## Target architecture

| Layer        | Choice                                                                  | Purpose                                                                                   |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Site         | Astro with TypeScript, statically rendered                              | Small output, strong content structure and minimal browser JavaScript                     |
| Edge hosting | Cloudflare Workers Static Assets                                        | Global static delivery with room for narrowly justified Worker features later             |
| Delivery     | GitHub Actions and Wrangler                                             | Visible, repeatable quality checks and deployments                                        |
| Environments | Pull-request previews, persistent development and production            | Test changes before promotion without mixing credentials or configuration                 |
| Measurement  | Standards-based metadata, automated checks and Cloudflare Web Analytics | SEO, accessibility, performance and real-user feedback without a custom analytics service |

The implementation targets Cloudflare's free allowances. The narrow Radar API route uses a Worker and edge-local caching; no R2, database, scheduled job or paid service is needed. Edge caching is not a global request quota or a guarantee against rate limiting.

## Delivery flow

| Change                 | Target             | Result                                  |
| ---------------------- | ------------------ | --------------------------------------- |
| Feature pull request   | `develop`          | Quality checks and a disposable preview |
| Merge to `develop`     | Development Worker | Persistent development deployment       |
| Promotion pull request | `main`             | Final review before production          |
| Merge to `main`        | Production Worker  | Production deployment                   |

Both long-lived branches require pull requests and reject deletion and force pushes. A named CI check will become mandatory after the workflow is introduced and has completed successfully.

## Current status

The local site has a personal homepage, Notes at `/notes/` and Experiments at `/experiments/`. Main navigation uses Notes, Experiments and Contact. The site is not yet live, so retired draft routes have no compatibility redirects. All navigation uses the current routes.

The homepage has its own fine-line connection graphic, with finite pulses on pointer, keyboard and touch interaction. It stays static without JavaScript or under reduced motion. The waveform lives only on Experiments. Experiments is a staggered gallery with immediately visible previews and optional controls. It includes CPU-only Kubernetes autoscaling and placement, a scripted agent/MCP loop, expanded waveform controls, latency and concurrency models, and a perspective-projected 3D network. Optional renderers load on opening; the network uses Canvas rather than requiring WebGL.

Kubernetes demand and CPU requests affect replica targets and pending pods. The agent model enforces its simulated host approval and tool-call budget, including failed attempts. Neither connects to a real system. Results and approval controls work independently of animation. Previews have a shared pause control; opened experiments offer pause/replay or rotation controls. Motion stops offscreen and in hidden tabs, and respects reduced motion. Readable examples remain without JavaScript.

Fonts are preloaded locally; slow responses keep the fallback font rather than shifting already-readable text. Initial loads and refreshes stay settled, with reveals reserved for previously offscreen content. The dh signature trace responds to hover and keyboard focus, adding its endpoint only after the line finishes drawing.

The work is organised around broader engineering practices, with contribution statements and specific decisions as evidence. Diagrams sit with the decisions they explain. The signal experiment compares a known waveform with the same waveform plus interference; it does not claim to filter or recover a real signal.

Light, dark and system themes share semantic colour tokens. A small, unframed icon cycles between system, light and dark within a full touch target, with monitor, sun and moon icons and accessible state/action labels. An explicit selection is remembered locally; unavailable browser storage does not prevent switching. Every primary route is checked in both palettes.

Current copy is approved for public development. Production publication, previews and analytics remain separate future work. Deployment status is verified independently of the configuration below.

The Internet atlas loads observed Cloudflare Radar data automatically through a same-origin Worker route. Traffic, Bots, Devices and Protocols tabs share a country picker, with source dates and reading guides below the map and chart. Traffic is a within-country relative index, not uptime; the other views are shares of observed HTTP requests. Missing readings remain gaps and failures never substitute sample data. The no-JavaScript fallback is explicitly an authored sample. Geography uses a bundled public-domain Natural Earth outline, without tiles or visitor geolocation.

Validated responses are reused in document memory for the bounded window in `src/experiments/radar-cache.ts`. That window limits browser-memory reuse, not the age of upstream observations: the existing HTTP/Worker cache policy and original source timestamps remain authoritative. Pointer or keyboard exploration can prefetch the current view for other countries and other views for the selected country, with one speculative request at a time and a document-lifetime budget defined alongside the cache. Foreground requests start directly and coalesce identical pending work. Hidden/offscreen or inactive exploration cancels speculative work; Save-Data and slow-connection hints disable it. A rate-limit or service-unavailable response stops speculation for that document. Failures remain retryable explicitly. Loading and unavailable states are labelled; N/A means a null reading in a successful response.

Shared page rhythm uses the small spacing scale and section, heading, copy and control aliases in `src/styles/global.css`. Section spacing steps down at the mobile breakpoint, while Notes and Experiments use the same aliases. Shared responsive heading tokens keep the role, page, section and card hierarchy proportionate without shrinking body copy or touch targets. Illustration aspect ratios, stable experiment frames and minimum touch-target sizes are deliberate geometry/accessibility exceptions. The homepage connection field keeps one authored asymmetric layout, with finite, varied pulses. It uses no storage or network; the no-JavaScript view retains the complete layout. It remains a decorative abstract graphic, with no measured activity or career evidence implied. The network has no heartbeat glyph; the separate dh signature mark is unchanged.

The selected-country pulse loops gently with the shared page-level pause/resume control, offscreen suspension and reduced-motion support. It marks selection, not a network ping. "Explore the source" opens a protected new tab.

The local Worker and real-data display are verified. Development configuration enables Radar, with separate credentials managed outside Git. Production remains disabled. Deployment status must be verified independently of committed configuration.

Hello and LinkedIn contact links open a separate tab, with a new-tab description and opener protection. The navigation's Contact link stays within the portfolio.

## Accessibility

The site targets WCAG 2.2 AA. Native links, buttons and a range input keep keyboard interaction familiar. A skip link moves focus into the main landmark, controls expose their state and purpose, and decorative graphics stay out of the accessibility tree. The signal experiment has a text description and meaningful slider values rather than screen-reader announcements on every frame.

Automated checks cover the primary routes, light and dark themes, keyboard focus, reduced motion, no-JavaScript content and enlarged-text reflow. Model tests check percentiles, request deadlines, replica bounds, CPU placement, approval and tool budgets. Browser tests check resets, deferred loading and animation suspension. These checks are not a certification or a substitute for testing with assistive technology. Browser coverage and any local launch failures must be reported from the actual test run.

Browser-test artefacts go into the current day's `scratch` directory outside the checkout. Set `PLAYWRIGHT_OUTPUT_DIR` to use another location, including a CI artefact directory. Opening an experiment keeps its graphic and Explore target steady, with controls below. Regression checks include repeat clicks at the same pointer position. Set `PORTFOLIO_DEV_URL` to a running local development URL to check waveform controls there as well as in the production build.

## Local development

Use Node 24 and npm:

```sh
npm ci
npm run dev
```

For Radar, run the local Worker on port 8787 as well; the Astro dev server proxies `/api/radar` to it. Supply `RADAR_API_TOKEN` through a server-process environment from your secret manager, without printing it or putting it in command arguments. Enable only the local development override with `wrangler dev --local --env development --ip 127.0.0.1 --port 8787 --var RADAR_ENABLED:true`. Without that server the site still loads, but the atlas reports unavailable data. Do not use the production credential locally.

`npm run types:worker` regenerates runtime and binding types after configuration changes. `npm run check` checks Astro and the Worker. The `sharp` dependency override keeps the shared image dependency on a patched release; review it when updating Wrangler/Miniflare.

Run the complete local gate before opening a pull request:

```sh
npx playwright install chromium firefox webkit
npm run quality
```

`npm run build` defaults to development. `npm run build:dev` emits no-index HTML, robots.txt and response headers. `npm run build:prod` requires an explicit HTTPS origin in `SITE_URL`, without credentials, a path, query or fragment. Production emits canonical, Open Graph, public-person structured metadata and a sitemap; no unreviewed social image is advertised. No-index directives are crawler guidance, not authentication.

The build generates `_headers` from actual HTML, hashing inline scripts and style elements. Script policy permits only self and those hashes, without inline or eval escape hatches. `style-src-attr 'unsafe-inline'` supports existing authored SVG/control style attributes; style elements remain self/hash restricted. API responses receive the shared policy in Worker code because static-asset headers do not cover generated responses. Assets retain direct static routing.

The Radar Worker admits requests through separate native ingress and cold-request bindings declared in `wrangler.jsonc`. Their constant keys retain no visitor identity. Limits are shared per Cloudflare location and eventually consistent; they are coarse protection for optional data, not per-person fairness or a hard global quota. A cold traffic request can make two upstream calls. Successful data remains cached during a different-country failure. Non-429 upstream failures establish a short shared per-origin backoff; bounded upstream Retry-After remains respected. Cache errors, missing limiters and limiter errors fail closed. No request promises are shared across requests because workerd owns request I/O.

`npm run test:runtime` bundles the real entrypoint and runs local workerd with native asset/cache/rate bindings and a fake credential. All outbound test responses are intercepted fixtures; the suite never contacts Radar. Playwright uses the same Worker harness and generated CSP. `npm run lint` checks JavaScript/TypeScript and Astro, including focused asynchronous-handling rules. Node test registrations are excluded from typed promise rules because the test runner owns their lifecycle. `PORTFOLIO_BROWSERS=chromium,webkit npm run quality` explicitly selects local engines; CI rejects that override and runs Firefox too. Firefox currently fails to launch on this macOS host; that local gap does not remove Linux CI coverage.

The read-only quality job runs checks, dependency audit and redacted secret scans using pinned official actions and a checksum-verified Gitleaks binary. A dependent deployment job runs only on trusted pushes to `develop`, using a branch-restricted GitHub development environment. Credentials exist only in its deployment step, after installation and build; the Radar secret is streamed to Wrangler through stdin. There is no production publishing job. Dependency updates group npm packages and GitHub Actions separately.

Development is approved as public and non-indexable without Cloudflare Access. The owner has chosen to use Radar under CC BY-NC 4.0; the atlas provides source credit, a licence link and a transformation notice. This does not imply endorsement or confirmation from Cloudflare. [Radar's licensing policies](https://radar.cloudflare.com/about#licensing-policies) distinguish API data from official embedded graphs. Production publication remains a separate decision.

Before the initial deployment: verify account feature availability and cost, run CI successfully before requiring its checks, configure deployment credentials separately, then verify the actual deployed URL, headers and runtime behaviour. No paid plan is enabled by local configuration. Native rate-limit behaviour is described in the [feature documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/); the feature page does not establish account-specific pricing. Only development has a custom-domain route. Production, workers.dev and preview URLs remain disabled.

## Repository guidance

[AGENTS.md](AGENTS.md) records the publication, security and engineering constraints that apply to every change. In particular, secrets, credentials and private working material must never enter Git, generated output or workflow logs.
