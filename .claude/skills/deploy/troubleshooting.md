# Deploy troubleshooting: known failure causes

What has gone wrong before, and how it was fixed. Read when a pipeline run, a deploy or the smoke test fails.

- **Frontend returns `500` / `error code: 1101` on `/api` after a backend Worker was deleted and recreated**: the frontend Worker's service binding still points at the deleted Worker. Redeploy the frontend in that environment (frontend repo: CI/CD on `main` for staging, Deploy production for production); the first requests right after can still fail for a few seconds. Recreating a backend Worker also drops its secrets (`JWT_SECRET_KEY`) and, on staging, its Cloudflare Access settings.

- **"Staging/Production lost articles in the deploy"**: `scripts/count-articles.sh` counted fewer articles after the deploy than before. Usual causes: the Worker name in `wrangler.jsonc` does not match the Worker in Cloudflare (a new, empty Worker was created), or the Durable Object instance name (`DB_NAME` in `src/db/everise-db.ts`) changed without a data copy. Do not redeploy over it; roll back the Worker version in the dashboard and investigate. Cloudflare keeps 30 days of point-in-time recovery for the database.

- **Missing secrets**: a deploy step fails with "it's necessary to set a CLOUDFLARE_API_TOKEN". Fix on GitHub, then `gh run rerun --failed`.
- **Staging smoke test gets `302` to `*.cloudflareaccess.com`**: Cloudflare Access rejected the request; the smoke output says whether a service token was sent and accepted. The policy list that Access enforces is the one in Zero Trust → Access controls → Applications → `<worker> - Cloudflare Workers` → Policies, and it can differ from what the Worker's Access tab shows: saving that application's Additional settings (CORS, cookies) from a stale page once dropped the `CI service token` (Service Auth) policy. Ask the user for a screenshot of that Policies tab first. To see which Access application handles a host, decode the `aud` in the redirect's `meta` token and compare it with the AUD tag on the Worker's Access tab.
- **Smoke test gets `404` / `error code: 1042`**: a brand-new `workers.dev` hostname is not live yet. Only happens on a Worker's first deploy; re-run the job after a minute.
- **Thousands of `Delete ␍` prettier errors locally**: Windows CRLF checkout. `.gitattributes` forces LF; if files still have CR, after committing run `git rm -rq --cached . && git reset -q --hard`.
- **Random 422 in tests**: faker data failing request validation (zod) (e.g. `faker.internet.url()` producing a non-ASCII host). Use ASCII-safe generators such as `faker.internet.avatar()`.
- **Other one-off test failures**: usually random faker data colliding (e.g. two random articles sharing a tag, which the API deduplicates). Fix the test's expectation, not the API, and check the failure is not reproducible before blaming the change being pushed.
- **Free-plan caps**: daily request limits are shared by both Workers. A sudden 429/1027 on both points at quota, not code.
