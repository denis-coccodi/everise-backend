---
name: backend-best-practices
description: Describes how backend code in this repo is written - routers and the API description, services, HttpError errors, types and settings, data and concurrency, tests, and the file size limits enforced by scripts/check-sizes.mjs. Use before writing or changing any code under src/ or __tests__/, when adding an endpoint or a setting, and when reviewing backend changes.
---

# Backend best practices

The Everise API: Express 5 running in a Cloudflare Worker, with the data in the `EveriseDb` Durable Object (see the `db-structure` skill). Code is organised by feature: `src/<feature>/` holds a `<feature>-router.ts`, a `<feature>-service.ts`, its models and DTOs (`<name>-model.ts`, `<name>-dto.ts`), and an `index.ts` that exports them. Other features import from that `index.ts`, never from a file inside it.

## Routers and the API description

- A router class takes its services (and `Auth`) in its constructor and builds an `express.Router` in its `router` getter. `src/app.ts` puts it together and mounts it under `/api`.
- Every endpoint is defined with `route(router, spec, handler)` from `src/api`. The spec has the method, the path, a summary, `auth` (`this.auth.required` / `.optional` / `.admin`), zod schemas for `params`, `query` and `body`, and every status it answers with its response schema. From that one definition:
  - the request is checked: a 422 lists one message per failing field (`src/api/messages.ts`), and the handler gets `req.params`, `req.query` and `req.body` parsed and typed;
  - the OpenAPI 3.1 document is built (`GET /api/openapi.json`, browsable at `/api/docs`), and the frontend generates its API types from it;
  - in tests (`CHECK_API_RESPONSES`), every JSON answer is checked against its declared schema. An undeclared status, or a field the schema doesn't name, fails the test with a 500.
- Schemas live next to the feature, in `<feature>-schemas.ts`. Response bodies use `responseSchema('Name', z.strictObject({...}))`; request bodies use `requestSchema('Name', z.object({...}))`. The name becomes the frontend's type name, so make it a noun (`Profile`, `ArticleResponse`, `NewComment`). Dates in responses are `isoDate`. Query values arrive as strings, so numbers use `z.coerce.number()`.
- Give limits a message the user can read (`.max(MAX, {error: 'Keep the comment to 280 characters.'})`), and take the numbers from constants the service exports. Don't copy them.
- `openapi.json` at the repo root is the committed copy of the document. `npm test` rewrites it when routes change and fails once; commit the new file. CI fails while it's out of date.
- The frontend (`../everise-frontend`) generates its API types from the `openapi.json` on `main` (`npm run api-types` there). So an API change merges here first; then the frontend regenerates and commits its types (its CI's `api-types` job fails until it does).
- A router only reads the request, calls services, and writes the response (status from `StatusCodes`). Rules and data access belong in the service.
- Express 5 forwards a rejected async handler to the error middleware by itself: handlers just `throw` or `await`, with no `try { ... } catch (err) { next(err) }`.
- Don't add plain `router.get(...)` routes: a route outside `route()` is missing from the document and from the response check.
- Shape answers so that a field means the same everywhere: a member is always `profileView()` (`Profile`), never a hand-made variant.
- A limit the frontend's forms also enforce goes in the response (e.g. `limits` in `GET /waking-sands/room`), so the frontend doesn't copy the number.

## Services

- Services are plain classes. Everything they use comes through the constructor: `Db`, other services, and `now: () => Date` / `random: () => number` when time or chance matters, so tests can fix them.
- A service returns models, not responses, and throws an app error when something can't be done.
- Limits and texts the frontend shows too are exported constants (e.g. `MAX_COMMENT_LENGTH`), so the router and the tests use the same value.

## Errors

- Every error the API answers on purpose extends `HttpError` (`src/errors/http-error.ts`) and declares its `status`. It can add `headers()` (e.g. `Retry-After`) or `extraBody()` fields, or override `publicMessage` to keep the reason out of the response (as `UnauthorizedError` does). The error handler (`src/error-handler`) needs no change for a new error.
- The message of an `HttpError` is shown to the user, so write it for them: say what happened and what to do.
- Each response has the shape `{errors: {body: [messages]}, ...extra}`. The frontend reads it with `serverMessage()`, so don't change it.
- Anything else ends up as a 500 with "internal server error". The full error goes to the log only.
- Errors that never reach a response (e.g. `SocialLoginError`, which becomes a redirect) stay plain `Error` subclasses, next to the code that handles them.

## Types

- No `any` in `src/` (lint fails: `@typescript-eslint/no-explicit-any`). Use `unknown` and narrow it, or write the type. Tests may use `any`.
- Stored documents are interfaces that extend `Doc`; read them with `db.get<T>()` / `db.find<T>()`.
- **Data types live in model and DTO files**, named after what they describe, in kebab case like every file here:
  - `<name>-model.ts`: the app's own data. That's stored documents, the records the app works with, and a service's params and results (`article-model.ts`, `duty-model.ts`, `pull-timeline-model.ts`). Several files of one feature share one model (`market-model.ts`).
  - `<name>-dto.ts`: what crosses the boundary. That's what the API answers when it's built by hand (`ArticleDto`, `memberDto`), and what an outside service sends before it becomes a model (`xivpf-dto.ts`, `partake-dto.ts`, `fflogs-dto.ts`, `discord-dto.ts`).
  - The API's request and response schemas stay in `<feature>-schemas.ts`.
- **Ports stay with their code.** An interface with methods (`Db`, `FileStore`, `EmailSender`, `CharacterModel`) or a function type (the `*Fetch` types tests replace) is declared next to what implements or uses it. A type only one file uses stays there, unexported. A type computed from a value (`typeof REGIONS`) goes to the model, which imports the value. `scripts/check-types.mjs` (part of `npm test`) fails an exported data type anywhere else.
- Settings come from `config` (`src/config.ts`), checked once by its zod schema (values come out typed). Never read `process.env` anywhere else. A new setting goes in the schema, `wrangler.jsonc` (or as a secret), and the test env in `__tests__/utils/env.ts`.
- A feature that isn't finished goes behind a feature flag: a name in `FEATURES` (`src/config.ts`), checked once where its routes are mounted in `src/app.ts` (the `trunk-based` skill).
- Workers runtime types (`DurableObjectNamespace`, `Request`, `Env`, `ctx.storage`) come from `worker-configuration.d.ts`, made by `wrangler types` on every `npm install` and not committed. After changing `wrangler.jsonc` (a binding, a variable), run `npx wrangler types`. Don't hand-write runtime types.
- A Durable Object's RPC stub types drop generics; type the stub once where it is wrapped (see `DurableObjectDb`), not at each call.

## Data and concurrency

- Store-wide changes that must happen together go in one `db.batch([...])`.
- A read, then a write based on what was read, races between two requests: each `Db` call is one RPC to the Durable Object, and other requests' calls can come between. Use the one-step operations instead: `addToSet`/`removeFromSet` for lists of ids (with `max` for a capped list), `takeLease` for "only one at a time" (renew it with `update` while working, release it with `update`), `increment` for counters, `createUnique` for anything that must not be created twice (a check before `create` still gives the nice message; `createUnique` is the guard). A new kind of read-modify-write gets a new one-step operation in `SqlDocumentStore` rather than a get and an update. `__tests__/concurrency` fires such requests together.
- File bytes (uploads, pictures) go in the `FileStore` (`src/files`: R2 in the Worker, memory in tests), never in a document; the document holds the owner, type and size. Write the file before its document and delete it before its document, so a document never names a missing file and a failed deletion can be retried. Every R2 operation counts against the free tier: serve files through the cache (`src/worker.ts`) and keep per-member limits.

## Tests

- Tests go through the HTTP API with `supertest` against the app from `__tests__/utils` (in-memory store, fake clock, fake XIVAPI). Clients like `usersClient` make the setup short.
- Every new route gets tests for the success case, its validation messages, sign-in (401) and permissions (403), and any limit (429 with `Retry-After`).
- Fix time and chance through the service's `now`/`random`. Tests never call the real network; external services have fakes in `__tests__/utils`.
- The API sends dates as ISO strings. Compare them with `atOrAfter(iso)` from `__tests__/utils`, not jest-extended's date matchers, which need `Date` objects.

## Size limits (`npm run sizes`, part of `npm test`)

| File           | Max lines |
| -------------- | --------- |
| `*-router.ts`  | 300       |
| `*-service.ts` | 350       |
| other `.ts`    | 350       |

- When a file hits its limit, split it rather than squeezing it: a separate router per resource (e.g. comments apart from articles), pure helpers in their own file (as `roulette-result.ts` is), or a smaller service for one job.
- No file is exempt: never raise a limit or add an exception to make a file pass.

## Before pushing

```
npm test          # tests, then tsc, gts lint (ESLint 9, eslint.config.js), prettier --check and the size check
npm run format    # fixes formatting (Prettier 3 via gts; Markdown is left as written)
```

Keep comments at the density of the surrounding code: a line on what a class or constant is for, and on any rule that isn't obvious from the code.

## Dependencies

- The Jest setup is CommonJS (ts-jest). Packages that ship only ESM (e.g. faker 10) can't be loaded by the tests; stay on their last CommonJS major until the test setup changes.
- `npm audit --omit=dev` must report 0 vulnerabilities. When a fix sits outside a dependency's pinned range, use `overrides` in `package.json` (e.g. a transitive package's patched minor), with a compatible version.
- TypeScript is pinned below what ts-jest supports (`<7` today). TypeScript 6 needs `types` listed in `tsconfig.json` and an explicit `moduleResolution`; the deprecated default makes ts-jest emit nothing ("Unable to process ... outDir").
