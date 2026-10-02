---
name: smoke-test
description: Check that the Conduit API responds and that data persists in the ConduitDb Durable Object, locally (wrangler dev) or on the deployed Worker. Use when asked whether the API is up, whether data is stored, or to verify a change in the running app rather than in Jest.
---

# Smoke-test the Conduit API

`scripts/smoke.sh` drives the real HTTP API with curl and a cookie jar:

- `create` mode registers a random user, reads `/api/user`, creates an article tagged `smoketest`, lists it and lists tags. It saves the username next to the cookie jar.
- `verify` mode logs that user in again and fetches the article by slug. Run it after a restart (local) or a redeploy (prod) to prove the data persisted.

Every request prints its status code in `[...]`. Expected: 201, 200, 201, 200, 200 for `create`; 200, 200 for `verify`.

## Local

1. Start the server in the background: `npx wrangler dev --port 8080` (needs `.dev.vars`; see README). Wait until `curl -s http://localhost:8080/api/tags` answers.
2. `sh .claude/skills/smoke-test/scripts/smoke.sh create http://localhost:8080 <scratchpad>/jar.txt`
3. To test persistence, stop the server and start it again, then run `verify` with the same jar path.
   - On Windows, killing the background Bash task does not always free the port. Stop it from PowerShell:
     `Get-NetTCPConnection -LocalPort 8080 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`
4. Local data lives in `.wrangler/state`; the smoke test leaves a user and an article there. Deleting the folder empties the database.

## Production (https://conduit.denis-coccodi.workers.dev)

- Read-only check, safe at any time: `curl -s -w " [%{http_code}]\n" https://conduit.denis-coccodi.workers.dev/api/tags`
- `create` writes a test user and article to the production database. Ask the user before running it there.

## Notes

- Auth works with the `token` cookie (the jar) or an `Authorization: Token <jwt>` header.
- Do not echo JWTs back to the user; mask them (`sed 's/"token":"[^"]*"/"token":"…"/'`).
