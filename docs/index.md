---
title: Overview
nav_order: 1
---

# Everise backend

The TypeScript backend of [everise.dev](https://everise.dev), the Everise FC community site. It runs on Cloudflare Workers and keeps its data in SQLite inside a Durable Object. The [frontend](/docs/frontend/) is an Angular app on Cloudflare Workers that forwards `/api` here.

These pages are the backend's technical reference, served at everise.dev/docs/backend/. They live in the repository's `docs/` folder and change in the same pull requests as the code. For what the site offers and how to use it, see the [site guide](/guide/).

| Page | What it covers |
|---|---|
| [Architecture](architecture.md) | Stack, modules, Durable Objects, request flow, cron |
| [API](api.md) | How endpoints are defined, auth levels, errors, every endpoint |
| [Data model](data-model.md) | The document store, collections, consistency, where else data lives |
| [Authentication](authentication.md) | Tokens, passwords, email confirmation, Turnstile, Google and Discord |
| [Configuration and local development](configuration.md) | Every setting, running locally, testing |
| [Operations](operations.md) | Environments, CI/CD, deploying, staging access, one-time setup |
| [Features](features/index.md) | How each feature works inside |

The full README in the repository has every detail. The live API description is at [apis.everise.dev/api/docs](https://apis.everise.dev/api/docs).
