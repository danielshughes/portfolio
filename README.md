# Dan Hughes Portfolio

Public source for Dan Hughes's engineering portfolio, covering observability, Kubernetes, infrastructure as code and interactive experiments.

Built with Astro and TypeScript for Cloudflare Workers Static Assets. A small Worker API supplies Cloudflare Radar data to the Internet atlas; the other experiments are synthetic and run in the browser.

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

The site works without Radar credentials. To load observed data locally, run the development Worker on port 8787 with a server-side `RADAR_API_TOKEN`; Astro proxies `/api/radar` to it. Without the Worker, the atlas reports unavailable data.

## Checks

Install the browsers once, then run the complete quality gate:

```sh
npx playwright install chromium firefox webkit
npm run quality
```

The gate covers formatting, lint, types, tests, accessibility and the build across all configured browsers. After editing GitHub Actions workflows, also run `npm run lint:workflows` (requires Go).

## Deployment

Feature pull requests target `develop`. A trusted push deploys development after CI passes, using environment-scoped GitHub secrets. Development is live at [dev.dlhs.co.uk](https://dev.dlhs.co.uk) and deliberately non-indexable while the portfolio is being reviewed. Production publication is not enabled.

Default builds are development-only and non-indexable. Production publication and automation, pull request previews and analytics are not implemented. Worker configuration lives in [wrangler.jsonc](wrangler.jsonc).

## Contributing and data

Read [AGENTS.md](AGENTS.md) for content, accessibility, security and contribution boundaries.

The Internet atlas uses Cloudflare Radar data under CC BY-NC 4.0, with attribution and transformation notices. See [Radar's licensing policies](https://radar.cloudflare.com/about#licensing-policies).
