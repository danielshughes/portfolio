# Portfolio

Public source for Dan Hughes's SRE, infrastructure and observability portfolio.

The site will be a compact, statically rendered page deployed through Cloudflare Workers Static Assets. Its delivery model is:

- feature pull requests target `develop` and receive disposable previews;
- `develop` deploys the persistent development site;
- promotion pull requests from `develop` to `main` deploy production after merge.

The website is not an online employment history. Public copy will not include employer names, formal employment titles, employment dates or career chronology. Evidence must be separately approved for public use before it enters this repository.

Implementation and deployment configuration will be added on feature branches. No website is deployed from this foundation commit.

## Security

This repository must not contain API tokens, credentials, private sourcebook material, private contact-routing data or secret values in examples. Deployment credentials will live in environment-scoped GitHub or Cloudflare secret storage.

See [AGENTS.md](AGENTS.md) for contribution and publication guardrails.
