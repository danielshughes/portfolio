# Dan Hughes Portfolio

Public source for Dan Hughes's engineering portfolio, covering observability, Kubernetes, infrastructure as code and interactive experiments.

Built with Astro and TypeScript for Cloudflare Workers Static Assets. Browser-local simulations sit alongside Cloudflare Radar, request metadata, scheduled observations, bounded AI inference and shared-state experiments.

## Routes

- `/`: personal homepage and featured work.
- `/notes/`: engineering decisions and technical depth.
- `/experiments/`: interactive models and the Internet atlas.

## Local development

Use Node 24 and npm:

```sh
npm ci
npm run dev
```

The pages work without credentials. For the API experiments, initialise local storage and start the Worker on port 8787:

```sh
npx wrangler d1 migrations apply HISTORY --env development --local
npm run dev:worker
```

Astro proxies `/api` and WebSockets to the Worker. Radar needs a server-side `RADAR_API_TOKEN`; unavailable services show an honest error or empty history, not invented data. AI inference is opt-in and uses its binding, not a browser key.

## Checks

Install the browsers once, then run the complete quality gate:

```sh
npx playwright install chromium firefox webkit
npm run quality
```

The gate covers formatting, lint, types, tests, accessibility and the build across all configured browsers. After editing GitHub Actions workflows, also run `npm run lint:workflows` (requires Go).

Documentation-only changes run a quick file check. They skip dependency installation, the full quality gate and deployment. Source, site content, assets, tests and configuration still run the full checks.

## Deployment

Feature pull requests target `develop`, configured for Access-protected [development](https://dev.danhughes.uk). Production is on hold. Its prepared promotion path requires separate approval and an explicit enable switch. Trusted development pushes deploy after CI passes, using GitHub environment secrets and database migrations before upload.

Default builds are non-indexable. Configuration lives in [wrangler.jsonc](wrangler.jsonc). See [architecture](docs/architecture.md) for the service connections and [operations](docs/operations.md) for setup, verification, limits and recovery. No pull-request deployments or paid fallback.

## Contributing and data

Read [AGENTS.md](AGENTS.md) for content, accessibility, security and contribution boundaries.

The Internet atlas uses Cloudflare Radar data under CC BY-NC 4.0, with attribution and transformation notices. See [Radar's licensing policies](https://radar.cloudflare.com/about#licensing-policies).
