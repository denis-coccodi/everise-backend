---
name: backend-best-practices
description: How backend code in this repo is written - routers, services, errors, validation, the database, tests, and the file size limits enforced by scripts/check-sizes.mjs. Use before writing or changing any code under src/ or __tests__/, and when reviewing backend changes.
---

# Backend best practices

The Everise API: Express 5 running in a Cloudflare Worker, with the data in the `EveriseDb` Durable Object (see the `db-structure` skill). Code is organised by feature: `src/<feature>/` holds a `<feature>-router.ts`, a `<feature>-service.ts`, its models and DTOs, and an `index.ts` that exports them. Other features import from that `index.ts`, never from a file inside it.

## Routers

- A router class takes its services (and `Auth`) in its constructor and builds an `express.Router` in its `router` getter. `src/app.ts` puts it together and mounts it under `/api`.
- Every route checks its input with `celebrate` (`Segments.BODY`, `PARAMS`, `QUERY`). Give limits a message the user can read (`.messages({'string.max': ...})`) and take the numbers from constants the service exports. Don't copy them.
- Sign-in: `this.auth.requireAuth` / `this.auth.optionalAuth`; `req.user` is then set (or `undefined`).
- A router only reads the request, calls services, and writes the response (status from `StatusCodes`, body as a DTO). Rules and data access belong in the service.
- Express 5 forwards a rejected async handler to the error middleware by itself. New handlers just `throw` or `await`; they don't need `try { ... } catch (err) { next(err) }`. The older handlers still have that wrapper; take it out when you are editing one of them anyway.

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
- Settings come from `config` (`src/config.ts`), checked once by its Joi schema. Never read `process.env` anywhere else. A new setting goes in the schema, `wrangler.jsonc` (or as a secret), and the test env in `__tests__/utils/env.ts`.

## Data and concurrency

- Store-wide changes that must happen together go in one `db.batch([...])`.
- A read, then a write based on what was read (counters, limits, toggles), can race between two requests. Keep the read and the write as close together as possible, and say in a comment when a race is accepted.

## Tests

- Tests go through the HTTP API with `supertest` against the app from `__tests__/utils` (in-memory store, fake clock, fake XIVAPI). Clients like `usersClient` make the setup short.
- Every new route gets tests for the success case, its validation messages, sign-in (401) and permissions (403), and any limit (429 with `Retry-After`).
- Fix time and chance through the service's `now`/`random`. Tests never call the real network; external services have fakes in `__tests__/utils`.

## Size limits (`npm run sizes`, part of `npm test`)

| File           | Max lines |
| -------------- | --------- |
| `*-router.ts`  | 300       |
| `*-service.ts` | 350       |
| other `.ts`    | 350       |

- When a file hits its limit, split it rather than squeezing it: a separate router per resource (e.g. comments apart from articles), pure helpers in their own file (as `roulette-result.ts` is), or a smaller service for one job.
- `KNOWN_OVER` in `scripts/check-sizes.mjs` holds the files that were already too long when the check came in, each at its size then. They may shrink, never grow. When one gets split, lower or remove its entry (the script says when).

## Before pushing

```
npm test          # tests, then tsc, gts lint and the size check
npx prettier --check src __tests__ scripts
```

Keep comments at the density of the surrounding code: a line on what a class or constant is for, and on any rule that isn't obvious from the code.
