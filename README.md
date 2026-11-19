# Everise backend

The API of [Everise](https://everise.dev), the Everise FC community site: a TypeScript backend on Cloudflare Workers,
its data in SQLite tables in a Durable Object.

[**everise.dev**](https://everise.dev) · [Frontend](https://github.com/denis-coccodi/everise-frontend) · [Documentation](https://everise.dev/docs/backend/) · [API docs](https://apis.everise.dev/api/docs) · [OpenAPI document](https://apis.everise.dev/api/openapi.json) · [Site guide](https://everise.dev/guide/)

## Tech stack

| Part       | Choice                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Runtime    | [Cloudflare Workers](https://developers.cloudflare.com/workers/), Node.js compatibility                                           |
| Language   | [TypeScript 6](https://www.typescriptlang.org/), strict, no `any` in `src/`                                                       |
| HTTP       | [Express 5](https://expressjs.com/), through Cloudflare's Node.js HTTP server support                                             |
| Validation | [zod 4](https://zod.dev): request checks, typed handlers and the OpenAPI 3.1 document                                             |
| Database   | SQLite in a [Durable Object](https://developers.cloudflare.com/durable-objects/): documents in an indexed table, one-step updates |
| Files      | [R2](https://developers.cloudflare.com/r2/) for uploaded images                                                                  |
| Real time  | WebSockets on a second, hibernating Durable Object                                                                                |
| AI         | [Workers AI](https://developers.cloudflare.com/workers-ai/) (Gemma)                                                               |
| Auth       | JWTs in an HTTP-only cookie, bcrypt, Google and Discord sign-in, email confirmation through [Resend](https://resend.com)          |
| Tests      | [Jest 30](https://jestjs.io) and supertest against the real app and SQLite (`node:sqlite`)                                       |
| Quality    | [gts](https://github.com/google/gts) (ESLint 9, Prettier 3), file size limits, the committed OpenAPI document checked in CI      |
| Delivery   | GitHub Actions: tests on every PR, staging on merge, production by hand                                                           |

## Getting started

```sh
npm install                # also sets up the commit-msg hook
npm start                  # the API on http://localhost:8080, with a local Durable Object
npm test                   # tests, type-check, lint, format and size checks: must pass before pushing
npm run orchestrator       # Claude Code's orchestrator, with the frontend in scope
```

`npm start` needs a `.dev.vars` and `npm test` a `.env`, with at least `BASE_URL`, `CORS_ORIGINS` and `JWT_SECRET_KEY`
([Configuration](https://everise.dev/docs/backend/configuration.html)).

## Where things are

- **[Documentation](https://everise.dev/docs/backend/)** (`docs/`): architecture, the API, the data model,
  authentication, settings, operations (environments, CI/CD, deploying, staging access, one-time setup) and each
  feature.
- **[Skills](.claude/skills)** and **[agents](.claude/agents)**: how work is done here, for people and Claude alike;
  shared ones come from the [everise plugin](https://github.com/denis-coccodi/everise-agents). Start with `CLAUDE.md`.
