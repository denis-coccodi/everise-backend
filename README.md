# ![RealWorld Example App](logo.png)

> A [TypeScript](https://www.typescriptlang.org/) backend for **Conduit**, a Medium-like social blogging app, implementing the [RealWorld](https://github.com/gothinkster/realworld) API spec. It runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with a [Durable Object](https://developers.cloudflare.com/durable-objects/) as its database, all on the free plan.

It covers users and authentication, profiles and follows, articles, comments, favorites, tags, feeds and pagination.

# How it works

The API is an [Express](https://expressjs.com/) app that runs inside a Cloudflare Worker through Cloudflare's [Node.js HTTP server support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/). It implements the RealWorld [endpoints](https://realworld-docs.netlify.app/docs/specs/backend-specs/endpoints) under `/api`.

```
Browser ──HTTPS──> Cloudflare Worker "conduit"
                    ├─ /assets/*  static files from public/ (served before the Worker runs)
                    └─ /api/*     Express app ──RPC──> Durable Object "ConduitDb" (document store)
```

| Folder               | Contents                                                           |
| -------------------- | ------------------------------------------------------------------ |
| `src/worker.ts`      | Worker entry point: starts the Express app and exports `ConduitDb` |
| `src/app.ts`         | Express setup: CORS, JSON, cookies, routers, error handler         |
| `src/users`          | Registration, login, logout, current user, JWTs                    |
| `src/profiles`       | Profiles and follows                                               |
| `src/articles`       | Articles, comments, favorites, tags and feeds                      |
| `src/middleware`     | Authentication (`requireAuth` / `optionalAuth`)                    |
| `src/db`             | The document store and the `ConduitDb` Durable Object              |
| `__tests__`          | API tests, one file per endpoint                                   |
| `public`             | Static assets, e.g. the default avatar                             |

## Database

![Database structure](docs/db-structure.svg)

The database is a single Durable Object, `ConduitDb`, with SQLite-backed storage. The app uses it as a small NoSQL document store (`src/db`):

- **Documents and keys.** Every document is a JSON value stored under the key `<collection>/<id>`, e.g. `users/2f1c…`. There are four collections: `users`, `follows`, `articles` and `comments`.
- **Common fields.** The store gives every new document an `id` (a UUID), `createdAt` and `updatedAt`. An update that changes nothing keeps the old `updatedAt`.
- **References.** Documents point to each other by id (`authorId`, `articleId`, `followerId`, `followeeId`). The database does not enforce these links; the services check them.
- **Arrays instead of collections.** An article's tags live in its `tags` array and the users who favorited it in its `favoritedBy` array, so there is no tags or favorites collection.
- **Queries.** `find` lists a collection by key prefix, then filters (`==` or `array-contains`), sorts and paginates in memory. This is fine at this app's scale but would need indexes for large data.
- **Consistency.** The Durable Object handles one request at a time and its storage is strongly consistent, so checks like "is this username taken?" or "is this slug taken?" can't race.
- **Access.** The Worker reaches the Durable Object over RPC through `DurableObjectDb`, which implements the same `Db` interface as the store. Tests use the same `DocumentStore` on an in-memory storage, so they exercise the real query logic.

Data is stored durably by Cloudflare. Locally it lives in `.wrangler/state`.

## Authentication

Registering or logging in returns a JWT in the response body and also sets it in an `httpOnly`, `Secure` cookie named `token`. Protected endpoints accept either that cookie or an `Authorization: Token <jwt>` (or `Bearer <jwt>`) header. `POST /api/users/logout` clears the cookie.

The cookie's `SameSite` value comes from `COOKIE_SAME_SITE`:

- `none` (default): needed while the frontend runs on another site, e.g. `localhost:4200` or another `*.workers.dev` subdomain. Every `*.workers.dev` subdomain counts as a separate site.
- `strict`: use this once the frontend and the API share one origin, for example a frontend Worker that forwards `/api/*` to this Worker through a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).

# Getting started

1. Install [Node.js and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
1. Run `npm install`.
1. Create `.dev.vars` (used by `npm start`):
   ```
   BASE_URL=http://localhost:8080
   CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
   JWT_SECRET_KEY=dummy-jwt-secret-key
   ```
1. Run `npm start`. The API runs on http://localhost:8080 with a local Durable Object.

Local data survives restarts. Delete `.wrangler/state` to start from an empty database. Values in `.dev.vars` override the `vars` in `wrangler.jsonc`.

To check the API is up:

```
curl http://localhost:8080/api/tags
```

## Configuration

| Variable                    | Description                                                        |
| --------------------------- | ------------------------------------------------------------------ |
| `BASE_URL`                  | Public URL of the API, used to build default avatar URLs           |
| `CORS_ORIGINS`              | Comma-separated frontend origins allowed to call the API           |
| `COOKIE_SAME_SITE`          | `none` (default), `lax` or `strict`                                |
| `JWT_SECRET_KEY`            | Secret used to sign JWTs. In production, set it as a Worker secret |
| `JWT_ISSUER`                | JWT issuer                                                         |
| `JWT_SECONDS_TO_EXPIRATION` | JWT and cookie lifetime in seconds                                 |

## Testing

1. Create `.env` (used by Jest):
   ```
   BASE_URL=http://localhost:8080
   CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
   JWT_SECRET_KEY=dummy-jwt-secret-key
   JWT_ISSUER=https://conduit.com
   JWT_SECONDS_TO_EXPIRATION=86400
   ```
1. Run `npm test`.

The tests run the Express app in Node against an in-memory document store, so they need nothing else running. After the tests, `npm test` also type-checks and lints the code.

# Deployment

The API is deployed at https://conduit.denis-coccodi.workers.dev.

## CI/CD

A GitHub Actions workflow (`.github/workflows/ci-cd.yaml`) runs on every push and pull request:

1. **test**: installs dependencies and runs `npm test` (tests, type-check and lint).
1. **deploy**: on pushes to `main` only, and only if the tests pass, runs `wrangler deploy`.

It can also be started by hand from the Actions tab (**Run workflow**).

## One-time setup

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and pick a `workers.dev` subdomain (Workers & Pages → Overview).
1. In `wrangler.jsonc`, set `BASE_URL` to `https://conduit.<your-subdomain>.workers.dev` and add your frontend's origin to `CORS_ORIGINS`.
1. Set the JWT secret on the Worker, using a long random string. It is kept across deploys:
   ```
   npx wrangler login
   npx wrangler secret put JWT_SECRET_KEY
   ```
   One way to generate it: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
1. Create an [API token](https://dash.cloudflare.com/profile/api-tokens) from the **Edit Cloudflare Workers** template.
1. In the GitHub repository go to Settings → Secrets and variables → Actions and add these repository secrets:
   - `CLOUDFLARE_API_TOKEN`: the token from the previous step.
   - `CLOUDFLARE_ACCOUNT_ID`: shown in the Cloudflare dashboard (Workers & Pages → Overview).

To deploy from your machine instead, run `npm run deploy` after `npx wrangler login`.
