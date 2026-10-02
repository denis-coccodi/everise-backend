Premise: I can't do BE for S#17 so BE changes are mostly AI Generated 
----------------
CHANGES
----------------

- ~~Periodic database backup system so that the Docker Firestore instance will repopulate on reboot.~~ Removed: local data now persists on its own. $${\color{red}\[AI\]}$$
- ~~Command to dump db content for external viewing.~~ Removed together with Firestore. $${\color{red}\[AI\]}$$
- Set up to avoid CORS errors with local FE. $${\color{red}\[AI\]}$$
- Send generic default image url instead of nothing as user image. $${\color{yellow}\[MANUAL\]}$$
- Reimplemented CRLF cookie Token Auth BE side. $${\color{red}\[AI\]}$$
- Moved off Google Cloud: Firestore, Cloud Run, Docker, Terraform and Cloud Build are replaced by Cloudflare Workers, a Durable Object as NoSQL database and GitHub Actions for CI/CD. Hosting is free. $${\color{red}\[AI\]}$$

$${\color{red}\[AI\]}$$: Change mainly implemented through the use of AI. <br>
$${\color{yellow}\[MANUAL\]}$$: Change mainly implemented manually.

---------------------
ORIGINAL README FILE
---------------------

# ![RealWorld Example App](logo.png)

> ### [TypeScript](https://www.typescriptlang.org/) codebase containing real world examples (CRUD, auth, advanced patterns, etc) that adheres to the [RealWorld](https://github.com/gothinkster/realworld) spec and API.

### [Demo](https://demo.realworld.io/)&nbsp;&nbsp;&nbsp;&nbsp;[RealWorld](https://github.com/gothinkster/realworld)

This codebase was created to demonstrate a fully fledged backend application built with **[TypeScript](https://www.typescriptlang.org/)** including CRUD operations, authentication, routing, pagination, and more.

We've gone to great lengths to adhere to the **[TypeScript](https://www.typescriptlang.org/)** community styleguides & best practices.

For more information on how to this works with other frontends/backends, head over to the [RealWorld](https://github.com/gothinkster/realworld) repo.

# How it works

This is an [Express.js](https://expressjs.com/) based web-application, written in [TypeScript](https://www.typescriptlang.org/), that implements the [RealWorld](https://realworld-docs.netlify.app/) API [endpoints](https://realworld-docs.netlify.app/docs/specs/backend-specs/endpoints).

It runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) (free plan) using Cloudflare's [Node.js HTTP server support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), so the Express app runs unchanged.

## System Design

```
Browser ──HTTPS──> Cloudflare Worker "conduit"
                    ├─ /assets/*  static files from public/ (served before the Worker runs)
                    └─ /api/*     Express app ──RPC──> Durable Object "ConduitDb" (NoSQL document store)
```

- **Database**: a single [Durable Object](https://developers.cloudflare.com/durable-objects/) with SQLite-backed storage, used as a key-value document store (`src/db`). Documents live under `<collection>/<id>` keys. Storage is strongly consistent and requests are processed one at a time, so checks like "is this username taken?" can't race. Queries scan a collection, which is fine at this app's scale.
- **CI/CD**: GitHub Actions (`.github/workflows/ci-cd.yaml`). Every push and PR runs the tests, type-check and lint. Pushes to `main` then deploy with `wrangler deploy`.

# Getting started

1. [Install `Node.js` and `npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
1. Run `npm install`.
1. Run `npm start`. The API runs on http://localhost:8080 using a local Durable Object, so no Docker is needed.

Local data is kept in `.wrangler/state` and survives restarts. Delete that folder to start from an empty database. Local settings live in `.dev.vars`, which overrides the `vars` in `wrangler.jsonc`.

## Testing

1. Run `npm test`.

Tests run the Express app in Node against an in-memory version of the same document store, so they need no Docker or emulator.

# Deployment

## [Cloudflare](https://www.cloudflare.com/) + GitHub Actions

### One-time setup

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and pick a `workers.dev` subdomain (Workers & Pages → Overview).
1. Create an [API token](https://dash.cloudflare.com/profile/api-tokens) from the **Edit Cloudflare Workers** template.
1. In the GitHub repository go to Settings → Secrets and variables → Actions and add these **secrets**:
   - `CLOUDFLARE_API_TOKEN`: the token from the previous step.
   - `CLOUDFLARE_ACCOUNT_ID`: shown in the Cloudflare dashboard sidebar (Workers & Pages → Overview).
   - `JWT_SECRET_KEY`: a long random string, e.g. the output of `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
1. In `wrangler.jsonc`, set `BASE_URL` to `https://conduit.<your-subdomain>.workers.dev` and add your frontend's origin to `CORS_ORIGINS`.
1. Push to `main`. The workflow tests the code, then deploys it.

### Cookies and the frontend

The auth cookie uses `COOKIE_SAME_SITE` (in `wrangler.jsonc`):

- `none` (default): needed while the frontend runs on another site, e.g. `localhost:4200` or another `*.workers.dev` subdomain. Every `*.workers.dev` subdomain counts as a separate site.
- `strict`: use this once the frontend and the API share one origin, for example a frontend Worker that forwards `/api/*` to this Worker through a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).
