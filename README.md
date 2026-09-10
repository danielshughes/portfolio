# Dan Hughes — Portfolio

Public source for a compact, evidence-led engineering portfolio focused on SRE, infrastructure, observability, incident management and practical uses of AI.

The finished site is intended to give recruiters and engineering leaders a quick, credible view of how I approach reliable systems. It will favour a small number of concrete examples over a long employment timeline or an exhaustive technology list.

## Project principles

- **Fast to understand:** one focused page with clear information hierarchy.
- **Evidence before assertion:** published claims must be supportable and appropriately scoped.
- **Static by default:** essential content works without client-side JavaScript.
- **Accessible and resilient:** semantic HTML, progressive enhancement and a WCAG 2.2 AA target.
- **Technology with a purpose:** infrastructure choices should improve delivery, security, operability or the reader's experience.
- **Public by design:** code and deployment configuration are inspectable; credentials and private working material are not.

## Target architecture

| Layer | Choice | Purpose |
|---|---|---|
| Site | Astro with TypeScript, statically rendered | Small output, strong content structure and minimal browser JavaScript |
| Edge hosting | Cloudflare Workers Static Assets | Global static delivery with room for narrowly justified Worker features later |
| Delivery | GitHub Actions and Wrangler | Visible, repeatable quality checks and deployments |
| Environments | Pull-request previews, persistent development and production | Test changes before promotion without mixing credentials or configuration |
| Measurement | Standards-based metadata, automated checks and Cloudflare Web Analytics | SEO, accessibility, performance and real-user feedback without a custom analytics service |

The initial implementation will stay within Cloudflare's free allowances. R2, dynamic Worker routes and other services will be added only if the portfolio develops a real need for them.

## Delivery flow

| Change | Target | Result |
|---|---|---|
| Feature pull request | `develop` | Quality checks and a disposable preview |
| Merge to `develop` | Development Worker | Persistent development deployment |
| Promotion pull request | `main` | Final review before production |
| Merge to `main` | Production Worker | Production deployment |

Both long-lived branches require pull requests and reject deletion and force pushes. A named CI check will become mandatory after the workflow is introduced and has completed successfully.

## Current status

The repository foundation, branch model, security controls and static Astro shell are in place. The next delivery step is the publication-gated evidence model; there is not yet a deployed website.

## Local development

Use Node 24 and npm:

```sh
npm ci
npm run dev
```

Run the static-output contract and production build before opening a pull request:

```sh
npm test
npm run build
```

## Repository guidance

[AGENTS.md](AGENTS.md) records the publication, security and engineering constraints that apply to every change. In particular, secrets, credentials and private working material must never enter Git, generated output or workflow logs.
