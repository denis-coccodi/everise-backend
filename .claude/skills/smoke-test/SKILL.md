---
name: smoke-test
description: Check that the Conduit API responds and that data persists in the ConduitDb Durable Object, locally (wrangler dev), on staging, or on production. Use when asked whether the API is up, whether data is stored, or to verify a change in the running app rather than in Jest.
---

# Smoke-test the Conduit API

`scripts/smoke.sh` (in the repo root, also run by CI against staging) drives the real HTTP API with curl and a cookie jar. It prints `ok`/`FAIL` per request with the status code, masks JWTs, and exits non-zero on any unexpected status.

- `create`: registers a random user, reads `/api/user`, creates an article tagged `smoketest`, lists it and lists tags. Saves the username next to the jar.
- `verify`: logs that user in again and fetches the article by slug. Run it after a restart or redeploy to prove the data persisted.

```
sh scripts/smoke.sh create <base-url> <scratchpad>/jar.txt
sh scripts/smoke.sh verify <base-url> <scratchpad>/jar.txt
```

## Targets

| Target | Base URL | May write test data? |
| --- | --- | --- |
| local | http://localhost:8080 | yes |
| staging | https://conduit-staging.denis-coccodi.workers.dev | yes; CI already does on every merge to `main`. Behind Cloudflare Access: needs `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` exported (a service token the user holds), otherwise expect a 302 to the Access login or a 403 |
| production | https://conduit.denis-coccodi.workers.dev | ask the user first; read-only `curl .../api/tags` is always fine |

## Local

1. Start the server in the background: `npx wrangler dev --port 8080` (needs `.dev.vars`; see README). Wait until `curl -s http://localhost:8080/api/tags` answers.
2. Run `create`. To test persistence, stop the server, start it again, run `verify` with the same jar.
   - On Windows, killing the background Bash task does not always free the port. Stop it from PowerShell:
     `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`
3. Local data lives in `.wrangler/state`. Deleting the folder empties the database.

## Notes

- A newly created `*.workers.dev` hostname answers `404` with body `error code: 1042` for up to a minute or so. Wait and retry before treating it as a failure.
- Auth works with the `token` cookie (the jar) or an `Authorization: Token <jwt>` header.
