---
name: smoke-test
description: Checks that the Everise API responds and that data persists in the EveriseDb Durable Object, locally (wrangler dev), on staging or on production, runs the cron trigger's jobs locally, and reads a deployed Worker's logs. Use when asked whether the API is up or data is stored, to verify a change in the running app rather than in Jest, or to see what a scheduled job did.
---

# Smoke-test the Everise API

`scripts/smoke.sh` (in the repo root, also run by CI against staging) drives the real HTTP API with curl and a cookie jar. It prints `ok`/`FAIL` per request with the status code, masks JWTs, and exits non-zero on any unexpected status.

- `create`: registers a random user (at Resend's test inbox, `delivered+…@resend.dev`), reads `/api/user`, creates an article tagged `smoketest`, lists it and lists tags. When the API confirms emails (`RESEND_API_KEY` set, as on staging and production), the sign-up answers "check your email" instead, so it checks that signing in is refused (`403`) until the link is opened and skips the article. Saves the username (and the article's id) next to the jar.
- `verify`: logs that user in again and fetches the article by slug. Run it after a restart or redeploy to prove the data persisted.

```
sh scripts/smoke.sh create <base-url> <scratchpad>/jar.txt
sh scripts/smoke.sh verify <base-url> <scratchpad>/jar.txt
```

## Targets

| Target | Base URL | May write test data? |
| --- | --- | --- |
| local | http://localhost:8080 | yes |
| staging | https://staging.apis.everise.dev | yes; CI already does on every merge to `main`. Behind Cloudflare Access: needs `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` exported (a service token the user holds), otherwise expect a 302 to the Access login or a 403 |
| production | https://apis.everise.dev | ask the user first; read-only `curl .../api/tags` is always fine |

## Local

1. Start the server in the background: `npx wrangler dev --port 8080` (needs `.dev.vars`; see README). Wait until `curl -s http://localhost:8080/api/tags` answers.
2. Run `create`. To test persistence, stop the server, start it again, run `verify` with the same jar.
   - On Windows, killing the background Bash task does not always free the port. Stop it from PowerShell:
     `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`
3. Local data lives in `.wrangler/state`. Deleting the folder empties the database.

## Scheduled jobs (the cron trigger)

`scheduled` in `src/worker.ts` runs every 2 minutes (`triggers.crons` in `wrangler.jsonc`): the shared Party Finder listings check and the Discord relays' read (`AppJobs` in `src/app-options.ts`). Tests call the same jobs through `jobs` from `__tests__/utils`.

- **Locally:** `npx wrangler dev --test-scheduled --port 8787`, then trigger a run with `curl "http://localhost:8787/__scheduled?cron=*/2+*+*+*+*"`. Each request is one run. Add `--persist-to <scratchpad>/state` to start from an empty database without touching `.wrangler/state`.
- **Deployed:** watch what runs with `npx wrangler tail [--env staging] --format json`. Its events are multi-line JSON; pipe them through [scripts/tail-events.mjs](scripts/tail-events.mjs) for one line per event with its logs and exceptions:
  ```
  timeout 260 npx wrangler tail --env staging --format json | node .claude/skills/smoke-test/scripts/tail-events.mjs --cron
  ```
  `--cron` keeps only the cron runs. A run's `console.log` lines (e.g. "Relays: … isn't shown") appear under it.
- Which version a Worker runs, and its settings: `npx wrangler deployments list [--env staging]`, then `npx wrangler versions view <version-id> [--env staging]` (handlers, variables, secret names).

## Notes

- A newly created `*.workers.dev` hostname answers `404` with body `error code: 1042` for up to a minute or so. Wait and retry before treating it as a failure.
- Auth works with the `token` cookie (the jar) or an `Authorization: Token <jwt>` header.
