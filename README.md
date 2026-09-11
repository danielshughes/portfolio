# Dan Hughes Portfolio

Public source for Dan Hughes's engineering portfolio, covering observability, Kubernetes, infrastructure as code and interactive experiments.

Built with Astro and TypeScript for Cloudflare Workers Static Assets. Browser-local simulations sit alongside Cloudflare Radar, request metadata, scheduled observations, bounded AI inference and shared-state experiments.

## Routes

- `/`: personal homepage and featured work.
- `/notes/`: engineering decisions and technical depth.
- `/experiments/`: interactive models and the Internet atlas.

## Local development

Use the Node release in [.nvmrc](.nvmrc) and the npm version in [package.json](package.json). To run the declared npm without changing a global installation:

```sh
npx --yes "$(node -p "require('./package.json').packageManager")" ci
npx --yes "$(node -p "require('./package.json').packageManager")" run dev
```

The remaining examples use `npm` as shorthand for that declared version. The pages work without credentials. For the API experiments, initialise local storage and start the Worker on port 8787:

```sh
npm run build:dev
npx wrangler d1 migrations apply HISTORY --env development --local
npm run dev:worker
```

Astro proxies `/api` and WebSockets to the Worker. In another terminal, `npm run dev:sample` triggers a real local health check. Radar needs a server-side `RADAR_API_TOKEN`. Cloudflare edge metadata and AI inference require the deployed site; local preview explains that limitation without inventing results. See [local operations](docs/operations.md#local-development-and-tests).

## Checks

Install the browsers once, then run the complete quality gate:

```sh
npx playwright install chromium firefox webkit
npm run quality
```

The gate covers formatting, lint, types, tests, accessibility and the build across all configured browsers. After editing GitHub Actions workflows, also run `npm run lint:workflows` (requires Go).

Documentation-only changes run file classification and redacted secret scanning. They skip dependency installation, the full quality gate and deployment. Source, site content, assets, tests and configuration still run the full checks.

## Deployment

Feature pull requests target `develop`, which deploys to Access-protected [development](https://dev.danhughes.uk). Reviewed `develop` to `main` promotions deploy the public [portfolio](https://danhughes.uk) with the production enable switch set. Both paths require passing CI, separate GitHub environment secrets and database migrations before upload.

Default builds are non-indexable. Configuration lives in [wrangler.jsonc](wrangler.jsonc). See [architecture](docs/architecture.md) for the service connections and [operations](docs/operations.md) for setup, verification, limits and recovery. No pull-request deployments or paid fallback.

For your own deployment, provision separate resources and replace the hostnames, resource IDs and public Turnstile keys. Never use this site's identifiers as your deployment target. No account access is needed for the local tests.

## Contributing and data

Read [AGENTS.md](AGENTS.md) for content, accessibility, security and contribution boundaries.

The Internet atlas uses Cloudflare Radar data under CC BY-NC 4.0, with attribution and transformation notices. See [Radar's licensing policies](https://radar.cloudflare.com/about#licensing-policies).
