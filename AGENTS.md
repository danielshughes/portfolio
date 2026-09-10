# Portfolio repository guidance

## Purpose

This public repository contains the website source and deployable configuration for Dan Hughes's portfolio. The private career sourcebook is a separate evidence system and must never be copied or linked into this repository.

## Public-content boundary

- Use **Observability & SRE Leader** as the portfolio headline.
- Keep SRE and infrastructure primary; AI is supporting evidence rather than a claim of AI/ML security expertise.
- Do not publish employer names, formal employment titles, employment dates or career chronology in copy, metadata, structured data, images, source maps or downloads.
- Do not publish a claim until its exact wording has an approved public-use decision in the private sourcebook.
- Never infer personal ownership, adoption, scale or outcome from platform access or team activity.
- Use exactly three selected-evidence entries in the initial page and keep visible copy concise.
- Keep private evidence labels, internal URLs, identifiable incidents and employer-derived assets out of Git and generated output.

## Secrets

- Never commit or print API tokens, service credentials, Turnstile secret keys, private contact routing or values from `.env` and `.dev.vars` files.
- Keep `.env*`, `.dev.vars*`, Wrangler local state and generated output ignored. An `.env.example` may contain key names and safe descriptions only.
- Use environment-scoped GitHub secrets or Cloudflare secret bindings for deployment and runtime credentials.
- A variable exposed to Astro client code is public. Do not put a secret in a public-prefixed variable.
- Pull-request workflows must not receive production credentials.
- If a credential is committed, rotate it immediately; deleting it from the latest revision is not remediation.

## Engineering expectations

- Essential content must be statically rendered and usable without client JavaScript.
- Use semantic HTML, modern standards-based CSS and progressive enhancement. Target WCAG 2.2 Level AA.
- Keep dependencies proportionate to the feature and preserve the editorial systems-notebook design direction.
- Treat `wrangler.jsonc` as the source of truth for Cloudflare Worker configuration.
- Keep development and production Workers, configuration and credentials separate.
- Run formatting, linting, type checking, tests, accessibility checks and the production build before merging.
- Inspect `dist/` recursively before deployment for secrets, private evidence and environment mistakes.
- Verify deployed behaviour through the actual URL, headers, metadata and page content; a successful upload alone is not completion.

## Git workflow

- Feature branches target `develop`.
- `develop` is the persistent development environment.
- Production promotion uses a pull request from `develop` to `main`.
- Do not push directly to protected branches, force-push or bypass required checks.
- Keep deployment workflows least-privileged and pin third-party actions to reviewed commit SHAs.
