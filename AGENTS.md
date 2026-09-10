# Portfolio repository guidance

## Purpose

This public repository contains the website source and deployable configuration for Dan Hughes's portfolio. The private career sourcebook is a separate evidence system and must never be copied or linked into this repository.

## Public-content boundary

- Use British English throughout visible copy, titles, metadata and documentation. Do not use em dashes. Keep required code/API spellings unchanged.

- Use **Observability & SRE Leader** as the prominent homepage headline, with Dan's name secondary. It is positioning, not a formal employment title.
- Keep SRE and infrastructure primary; AI is supporting evidence rather than a claim of AI/ML security expertise.
- Do not publish employer names, formal employment titles, employment dates or career chronology in copy, metadata, structured data, images, source maps or downloads.
- Do not publish a claim until its exact wording has an approved public-use decision in the private sourcebook.
- Never infer personal ownership, adoption, scale or outcome from platform access or team activity.
- Use a personal homepage, `/notes/` for engineering depth and `/experiments/` for optional experiments. Main navigation labels are single words: Notes, Experiments, Contact. Do not impose a single-page layout, three evidence entries or an application-form structure.
- Lead with concrete engineering decisions and personality, not abstract business slogans. Personal interests must be sourced; never invent hobbies or favourites.
- Browser-local simulations must be clearly synthetic, keyboard usable and optional. The Radar atlas is separately labelled observed data. Never fabricate production telemetry, terminal output or operational status.
- The Internet atlas automatically requests Radar on initial load and refresh. Its Traffic, Bots, Devices and Protocols tabs share country selection and source metadata. Missing readings are gaps; reported disruptions must not be inferred from traffic dips. Failures clear readings without substituting samples. The static no-script view is explicitly an authored sample. Keep the Radar token server-side and resolve the API data licence before publication.
- The Internet atlas sits directly on the page without a coloured panel. Keep accent colour on selected markers and the traffic line, not a large map backdrop.
- Separate development and production Radar Read credentials are stored in 1Password; retrieve references from the private operational record. Expiry and token IDs belong in the vault, not this repository. Local Worker and browser integration are verified; this does not mean deployed production. Keep committed environments disabled until deployment is authorised.
- Radar reading guides sit below the shared map/chart surface, with an accessible description association. Keep chart alignment and mobile reflow in the geometry tests. The selected-country pulse loops gently with the shared page-level background-motion control, suspends offscreen/hidden and respects reduced motion. It is a selection cue, not a ping or measured activity.
- Radar loads automatically on opening, reload and country/view selection. Show only source update metadata in normal operation, without a manual refresh icon, spinner, completion message or client fetch timestamp. Offer Retry Radar only after a failed request; successful retry hides it again.
- Preserve the document-memory Radar cache and bounded speculative queue in `src/experiments/radar-cache.ts`. Reuse validated responses only within its window; do not describe that as upstream freshness. Keep foreground priority, identical-request coalescing, exploration/visibility/connection-hint gating and document-level speculative backoff. Loading/unavailable placeholders are distinct from N/A null readings; source timestamps and Worker limits remain authoritative.
- Omit absent Radar confidence from visible metadata. Preserve null in the data contract, and continue showing supplied confidence ratings and source-quality warnings in every view.
- Motion is progressive enhancement: respect reduced motion, keep content visible without scripts and avoid scroll hijacking.
- Keep initial loads, refreshes and restored section links settled. Reveal previously offscreen content on exploration, not content already in view. Preload local fonts and avoid late font swaps that shift readable content.
- The Notes page lives at `/notes/`; titles and destination labels use Notes, not Engineering notes. Do not retain `/work/` or `/playground/` forwarding pages: the site is pre-publication and all links must use current routes. The homepage `#work` anchor remains separate.
- Kubernetes and infrastructure as code must be visible in the opening and featured work, substantiated by the recorded configuration, Helm delivery, Terraform and rollout decisions. Do not turn this into unsupported cluster ownership or a keyword inventory.
- Keep the homepage connection graphic distinct from Experiments. It is abstract, browser-local geometry with finite pulses, not telemetry. The waveform lives only on Experiments and adds synthetic interference, not signal recovery or incident detection. The dh signature trace redraws on hover/focus; its endpoint appears only when the stroke finishes. Reduced motion shows the complete static mark.
- Keep private evidence labels, internal URLs, identifiable incidents and employer-derived assets out of Git and generated output.

## Secrets

- Never commit or print API tokens, service credentials, Turnstile secret keys, private contact routing or values from `.env` and `.dev.vars` files.
- Keep `.env*`, `.dev.vars*`, Wrangler local state and generated output ignored. An `.env.example` may contain key names and safe descriptions only.
- Use environment-scoped GitHub secrets or Cloudflare secret bindings for deployment and runtime credentials.
- A variable exposed to Astro client code is public. Do not put a secret in a public-prefixed variable.
- Pull-request workflows must not receive production credentials.
- If a credential is committed, rotate it immediately; deleting it from the latest revision is not remediation.

## Engineering expectations

- Review content, visual hierarchy and interaction as one unit. Every featured project must identify Dan's supported contribution, a specific decision and its qualitative consequence; a tool list or anonymous project description is insufficient.
- Explanatory diagrams must explain the adjacent engineering decision. Label conceptual demonstrations and never imply that synthetic traces are production evidence. The decorative homepage connection field is a separate abstract accent, not a career-evidence diagram.
- Note-preview links share a consistent hover and keyboard-focus response, with restrained motion inside the graphic and static captions. Respect reduced motion, avoid sticky touch hover and keep first-tap navigation working. Non-interactive diagrams within notes should not mimic clickable previews.
- Light and dark palettes are both designed states. Support system preference, an explicit persistent override, reduced motion, keyboard controls and no-JavaScript fallback; test every primary route in both palettes.
- Use an icon button for theme selection, not a dropdown. Its icon and accessible label must describe the selected preference, including system mode; state the next action in the label.
- External Hello/Contact links open in a new tab with an accessible new-tab description and `rel="noopener noreferrer"`. Internal Contact navigation remains in the current tab.
- The Experiments "Explore the source" link follows the same protected new-tab convention.
- The shared footer's View source link also opens a protected new tab and describes that behaviour accessibly.
- Keep the theme control visually unframed and subordinate to navigation, with a small icon inside a full 44 px touch target.
- Accessibility includes keyboard behaviour and assistive-technology semantics, not only an automated score. Verify skip-link focus, visual/DOM order, landmarks, heading hierarchy, meaningful control values and concise link names. Prefer native elements; add ARIA only for information they do not already expose. Do not announce animation frames to screen readers or claim VoiceOver/NVDA testing without actually running it.
- Functional tests are necessary, not a design verdict. Inspect complete sections visually and ask whether the work distinguishes Dan without generic superiority claims or unsupported ownership.
- Reflow checks must cover actual section containment, inter-section gaps and numeric labels, not only document overflow. Do not use percentage row gaps in intrinsic-height stacked sections; keep index numbers unbroken.
- Use the shared spacing and responsive heading tokens in `src/styles/global.css` for route rhythm and proportionate typography. Keep readable body copy, illustration aspect ratios, stable experiment frames and touch-target minimums as purposeful exceptions. The decorative homepage connection field keeps one authored asymmetric arrangement across reloads; preserve its fixed frame, no-JavaScript fallback, finite pulses and reduced-motion presentation. Do not restore random layout selection or the network's heartbeat glyph, or confuse it with the separate dh signature mark.
- Experiment graphics and their Explore targets keep the same dimensions and position when opened or closed. Place controls below the disclosure, outside the visual frame; retain readable, unclipped content with enlarged text. Test repeated clicks at the original pointer position.
- After changing shared component markup or scripts, verify the actual development URL as well as the production build. If the preview serves a stale transform, restart only that project's dev server and retest.

- Essential content must be statically rendered and usable without client JavaScript.
- Use semantic HTML, modern standards-based CSS and progressive enhancement. Target WCAG 2.2 Level AA.
- Keep dependencies proportionate to the feature. The design direction is a personal engineering playground: distinctive typography, purposeful interaction and an obvious path to substantive work.
- Experiments quantitative models are deterministic, browser-local and synthetic. Show previews immediately in a staggered gallery with native DOM order and a single-column mobile layout. Load optional renderers on opening; stop animation while closed/offscreen/hidden and provide preview pause, replay/reset, reduced motion and native keyboard controls. Logical results and approval controls must not wait for an animation to finish. Keep readable alternatives and do not equate a visual toy with career evidence.
- The Kubernetes experiment is a CPU-only HPA snapshot and illustrative placement model, not a full scheduler or VPA implementation. The agent/MCP experiment is scripted, with host-owned approval policy and a tool-call budget. Never add a backend, real cluster connection or paid model call merely for a demo.
- Treat `wrangler.jsonc` as the source of truth for Cloudflare Worker configuration.
- Keep development and production Workers, configuration and credentials separate.
- Run formatting, linting, type checking, tests, accessibility checks and the production build before merging.
- `npm run quality` is the local/CI gate: formatting, focused lint, types, model/Worker/static/environment/runtime tests, a safe development build and all configured browsers. Local `PORTFOLIO_BROWSERS=chromium,webkit` selection is explicit; CI runs every engine and rejects overrides. Report the known local Firefox launch gap rather than treating it as a pass.
- Build defaults are development and non-indexable. Production requires `SITE_ENV=production` and a validated HTTPS `SITE_URL` origin. Keep canonical, OG, structured metadata and sitemap production-only. Metadata uses existing public identity/links, with no employer chronology or unsupported claims.
- Preserve Astro's client-environment optional-import module-preload hook and page-reload recovery. The generated `_headers` hashes actual inline script/style bytes; only style attributes allow inline CSS. Worker API responses use the shared security policy. Playwright serves generated assets through the fake-data workerd harness, not a policy-free static server.
- Keep native ingress/cold rate bindings separate by environment. Constant keys avoid visitor identifiers; limits are coarse, eventually consistent and per location. Never claim a global quota or share pending I/O promises across requests. Non-429 failures back off per origin, cache successes remain usable, and protection/cache failures must fail closed.
- Automated runtime tests use only an explicitly fake credential and intercepted upstream fixtures. Never read real credentials into tests. Regenerate Worker binding types from the config after changes. Worker dry-run output belongs in dated scratch, not the checkout.
- The quality job is read-only, SHA-pinned and has no deployment secrets. A dependent development deployment job runs only for a trusted push to `develop`, using a branch-restricted GitHub environment. Stream runtime secrets to Wrangler through stdin, not argv or checkout files. Confirm rate-limit account availability/cost before deployment; do not enable a paid plan. Development is approved as public and non-indexable without Access. The owner has chosen to use Radar under CC BY-NC 4.0; preserve attribution and licence/transform notices without implying vendor confirmation. Production publication remains a separate decision.
- Inspect `dist/` recursively before deployment for secrets, private evidence and environment mistakes.
- Verify deployed behaviour through the actual URL, headers, metadata and page content; a successful upload alone is not completion.

## Git workflow

- Feature branches target `develop`.
- `develop` is the persistent development environment.
- Production promotion uses a pull request from `develop` to `main`.
- Do not push directly to protected branches, force-push or bypass required checks.
- Keep deployment workflows least-privileged and pin third-party actions to reviewed commit SHAs.
