# Portfolio repository guidance

## Scope and boundaries

This is the public website repository. Keep it self-contained: never link to or copy the private sourcebook, its paths, credentials, employer material or identifiable incidents. Private records may link here, never the reverse. Public setup must work with a contributor's own resources.

Use British English, no em dashes, concrete engineering language and supported claims. Keep SRE/infrastructure prominent alongside documented AI tooling and leadership. Portfolio positioning is not an employment title or evidence of model research. Employer names, employment titles/dates and chronology are excluded from all public output, including metadata and generated assets. New career claims and personal details require an explicit public-use decision; access or team activity does not establish personal ownership, adoption or impact.

Keep synthetic simulations, fixed fictional AI scenarios, external observations and measured service results distinguishable. Missing data stays missing. Do not fabricate telemetry, completed model checks or public-use approval.

## Read for the change

Use the relevant contract, not the whole document set before every edit:

| Change                                                | Authoritative context                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Homepage, Notes, shared styling or motion             | [Design](docs/design.md) for visual intent, accessibility and regression boundaries       |
| Experiment copy, controls, graphics or lifecycle      | [Experiments](docs/experiments.md) for each interaction's meaning and shared patterns     |
| Worker APIs, caching, admission or storage            | [Architecture](docs/architecture.md) for data flow, schema and trust boundaries           |
| AI model, prompt, scenario or validation              | [AI review](docs/ai-review.md) for factual evaluation and abuse controls                  |
| Local setup, dependencies, CI, deployment or recovery | [Operations](docs/operations.md) for commands, environment gates, budgets and live checks |

Code/configuration owns changeable values: `package.json` and `.nvmrc` own the toolchain, `wrangler.jsonc` owns bindings/schedules, and service modules own application limits. Update affected contracts rather than repeating inventories or constants here. Keep README concise.

## Security and environment

Credentials belong in 1Password and scoped delivery/runtime bindings, never output, arguments, source or test artefacts. Keep local secret/state files ignored. Public-prefixed client variables are public; PR jobs receive no deployment credentials. Rotate exposed credentials, including those removed from Git's latest revision.

Development at `dev.danhughes.uk` remains hostname-Access-protected and non-indexable, with separate production resources at `danhughes.uk`. No-index is not authentication. Keep worker/preview alternate URLs disabled. Access administration is outside website CI; preserve reusable owner policies and check references before cleanup.

Preserve input validation, fail-closed admission, bounded work and independent environment budgets. Per-location rate limits are not global quotas. Real AI has fixed inputs, server-verified single-use Turnstile and atomic D1 reservations; model output is untrusted and never a confirmed diagnosis. Scheduled Radar claims each slot atomically before provider/storage work; health settles independently. Follow the architecture for failure/replay semantics and additive migrations.

Free-tier budgets cover both environments and other account use. No paid fallback or plan upgrade. Privacy claims describe application behaviour, not an absence of hosting-platform request logs. Preserve Radar attribution and the owner's licence decision without implying vendor confirmation.

## Work and verification

Continue an authorised change through implementation, relevant verification, affected documentation and the requested delivery outcome. Fix regressions within that scope without asking at every step; stop for missing authentication, destructive action, paid usage or a materially different decision.

Local automated tests use disposable state, fake credentials and intercepted upstream fixtures. They can run without account access. Use focused checks while iterating; reuse unchanged results instead of rerunning the entire suite for prose-only edits. The required CI gate remains authoritative before merge. `npm run quality` exercises the complete configured gate; an explicitly selected local browser subset is not an all-browser pass.

For UI changes, inspect affected sections on desktop/mobile in both palettes, including keyboard, reduced motion and no-script behaviour. Automated scores are not a design verdict or spoken screen-reader certification. Workerd tests verify runtime boundaries; deployed Access, bindings, real inference and genuine scheduled writes need live evidence when changed. Do not seed history to prove Cron delivery.

Keep failed-test evidence redacted, fixture-only and in the dedicated scratch/output location. Investigate failures rather than adding retries to obtain green. Report the completed command's result and unverified limits accurately.

## Documentation completion

Before closing any change, inspect README.md, this file, documentation indexes and the affected contracts above. Search tracked docs for the changed names, values and behaviour, including summaries outside the edited files. Update every affected reference, verify relative links and heading anchors, and state what was checked in the PR or hand-off. If no update is needed, record why; do not make cosmetic edits to satisfy the check.

Current guides describe the implemented contract; release claims need version-specific evidence. Keep each changing fact in one authoritative place and link summaries to it. Retain historical plans only for useful rationale, provenance or recovery, with a clear status and a link to the current contract. Mark completed or superseded plans explicitly; preserve original unchecked steps as historical proposals, not open tasks or fabricated passes. Documentation-only corrections use the existing lightweight CI path.

## Delivery

Feature PRs target `develop`; production promotion is a reviewed `develop` to `main` PR with the explicit production switch enabled. GitHub Actions is the sole deployer. No direct uploads, protected-branch pushes, force pushes or required-check bypasses.

The required `quality` job always reports. Docs-only changes retain secret scanning; code changes require full quality or the exact-tree proof in `scripts/ci-reuse.mjs`. Keep fresh dependency auditing and secret scanning, full-check fallback on ambiguous proof, and independent environment builds/migrations. A green docs-only or reused job is not itself a full-check proof. See operations for queue semantics and deployment verification.

After a verified merge, clean up its feature branch only after checking merged content, open PRs, worktrees and unique work. Preserve persistent `main`/`develop` branches and user edits. A squash merge requires content verification, not ancestry alone.
