---
title: Architecture
nav_order: 2
---

# Architecture

## Stack

| Part | Choice |
|---|---|
| Runtime | Cloudflare Workers, Node.js compatibility |
| Language | TypeScript 6, strict, no `any` in `src/` |
| HTTP | Express 5, through Cloudflare's Node.js HTTP server support |
| Validation | zod 4: request checks, typed handlers and the OpenAPI 3.1 document |
| Database | SQLite tables in the `EveriseDb` Durable Object |
| Files | R2 (`IMAGES` binding) for uploads, game images and relayed Discord pictures |
| AI | Workers AI (`AI` binding) for The Waking Sands and Tataru's lines |

## Request flow

```
Browser ── everise.dev (frontend Worker) ──/api/* service binding──> be-prod (this Worker)
                                                                      ├─ Express app (src/app.ts)
                                                                      ├─ /api/live WebSockets ──> LiveHub
                                                                      └─ scheduled() every 2 min (cron)
```

- **Routing in front of Express:** `src/worker.ts` is the entry point. It sends WebSocket requests for `/api/live` straight to the `LiveHub` Durable Object, and serves edge-cached images (uploads, item icons). Everything else goes to the Express app.
- **Same origin:** browsers reach the API same-origin through the frontend Worker's service binding. The backend also answers directly at `apis.everise.dev`.

## Durable Objects

| Class | Binding | Holds |
|---|---|---|
| `EveriseDb` | `DB` | The whole document store (one instance, `everise`) |
| `LiveHub` | `LIVE` | Live-update WebSockets, with the hibernation API |
| `PartyFinderHub` | `PARTY_FINDER` | The Party Finder board, read from xivpf at most once a minute |
| `MarketHistoryHub` | `MARKET` | One per item and region: daily prices per world |
| `PlannerHub` | `PLANNER` | Reads FFLogs pulls (several MB of events, more CPU than a Worker request may use), with one shared FFLogs token |

## Modules (`src/`)

| Area | Folders |
|---|---|
| Users and accounts | `users`, `profiles`, `social-login`, `email`, `turnstile` |
| Content | `articles`, `media`, `files`, `notifications`, `live` |
| Community data | `relays`, `discord`, `party-finder`, `party-finder-shares`, `events`, `venues`, `market` |
| Game | `duties`, `roulette-posts`, `planner`, `waking-sands` |
| Platform | `api`, `db`, `middleware`, `errors`, `error-handler`, `config`, `admin`, `sitemap` |

Code rules (routers and services, `HttpError`, no `any`, file size limits) are in the repository's `backend-best-practices` skill.

## Scheduled work

The cron trigger (`*/2 * * * *`, in production and on staging) runs `scheduled` in `src/worker.ts`. Each run:
1. reads the relayed Discord channels (Weekly and Hunts);
2. checks which shared Party Finder listings have ended, and notifies whoever shared them.

The market history uses each Durable Object's own alarms instead of the cron. Events, venues and the Party Finder are read on demand and cached.

## Feature flags

`FEATURES` lists the features switched on in a deployment, and `src/config.ts` names the ones that can be switched. A feature's routes are mounted only when it's on. Staging turns on everything being built, production only what's released, and the tests turn on everything. Today the only flag is `planner`.
