---
name: deploy
description: Ship this repo to Cloudflare Workers (staging, then production) through the GitHub Actions pipeline, or by hand with wrangler, and diagnose failing CI/CD runs. Use when asked to deploy, push and deploy, check or re-run the pipeline, or fix a red build.
---

# Deploy the Everise backend

Repo: `denis-coccodi/everise-backend`, branch `main`. Cloudflare account ID: `ba2955b2991a5a38d46bc4144212e9cc`.

| Environment | Worker | URL | wrangler |
| --- | --- | --- | --- |
| staging | `be-staging` | https://staging.apis.everise.dev | `npx wrangler deploy --env staging` |
| production | `be-prod` | https://apis.everise.dev | `npx wrangler deploy` (`npm run deploy`) |

Each Worker has its own Durable Objects: `EveriseDb` (`DB`, the data) and `LiveHub` (`LIVE`, the live updates' WebSockets, holding no data). Staging is defined under `env.staging` in `wrangler.jsonc`; `durable_objects` and `vars` are not inherited from the top level, so any new binding or var must be added in both places.

## Normal path: merge a PR into main

Changes reach `main` only through pull requests (see the `feature-branch` skill); direct pushes are rejected. Merging is the "push to `main`" that triggers the staging deploy.

`.github/workflows/ci-cd.yaml` (**CI/CD**: push to `main`, PRs, and `workflow_dispatch` on any branch):
- **test**: `npm ci` then `npm test`, which also runs `tsc --noEmit` and `gts lint` via `posttest`. Test env vars are set in the workflow; `.env` is not committed.
- **deploy-staging** (after test, on push to `main` or a manual run): deploys staging with message `<branch>@<sha>`, runs `scripts/smoke.sh create` against it, and writes a summary (on `main`, with a link to the production workflow). GitHub environment `staging`, any branch. Job-level `concurrency: deploy-staging` serializes deploys.
- Deploy another branch to staging: `gh workflow run ci-cd.yaml --ref <branch>` (or Actions → CI/CD → Run workflow). There is one staging Worker, so this replaces what is there until the next merge to `main`. Tell the user which branch staging is now running.

`.github/workflows/deploy-production.yaml` (**Deploy production**, `workflow_dispatch` only):
- First checks that `GITHUB_SHA` has a successful CI/CD push run (`gh run list --commit ... --status success`); otherwise fails without deploying.
- Then `wrangler deploy` and a curl of `/api/tags`. GitHub environment `production`, limited to `main`, no reviewers.

Production deploys are the user's decision: they start it from Actions → Deploy production → **Run workflow**. Only start it yourself (`gh workflow run deploy-production.yaml --ref main`) when the user explicitly asks for a production deploy, and only after the commit's CI/CD run is green.

Before pushing, run `npm test` locally; it must end with exit code 0, not just passing Jest.

After merging, wait for the run on `main` and report each job:
```
gh run list --limit 1
gh run view <id>                                   # job summary
gh run view <id> --json status,jobs -q '{run: .status, jobs: [.jobs[] | {name, status, conclusion}]}'
gh run view <id> --log-failed                      # only the failing step
gh run rerun <id> --failed                         # after fixing secrets or a flaky test
```
The Jest log is noisy (expected `console.error` output from error-path tests). Search the saved log for `FAIL `, `● ` (excluding `● Console`), `Tests:` and `error` lines instead of reading it all.

## Manual deploy

Wrangler on this machine is logged in with OAuth (`npx wrangler whoami`). Deploying production by hand skips the "passed staging" check, so only do it when the user explicitly asks for a manual production deploy.

## Secrets

- `JWT_SECRET_KEY` is a Worker secret on each Worker, set once with `npx wrangler secret put JWT_SECRET_KEY [--env staging]`. It survives deploys; the pipeline does not upload it. Check with `npx wrangler secret list [--env staging]`. A random value can be piped in without printing it: `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))" | npx wrangler secret put JWT_SECRET_KEY --env <env>`.
- `DUTIES_REFRESH_KEY` allows `POST /api/duties/refresh`. It is set twice per environment, with the same value: as a Worker secret (`npx wrangler secret put DUTIES_REFRESH_KEY [--env staging]`) and as a GitHub environment secret (`staging` / `production`) read by the **Refresh FFXIV duties** workflow. The workflow's 401 error means the two differ or the Worker secret is unset. The user sets the GitHub one; a random value can go to both by piping the same value, but never print it.
- GitHub secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are set by the user. Writing them with `gh secret set` is blocked by the permission classifier, so give the user the exact steps instead: Cloudflare dashboard → API Tokens → "Edit Cloudflare Workers" template → Account Resources: their account, Zone Resources: all zones from the account → create, then repo Settings → Secrets and variables → Actions. Never ask them to paste the token into chat.
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (repository secrets, set by the user): the Cloudflare Access service token the staging smoke test sends. Staging is behind Access (README → Staging access); if the smoke test starts failing with 302/403, the token is missing, expired, or not in the Access application's Service Auth policy. Zero Trust settings are dashboard-only for the user; wrangler's OAuth login has no Access scopes.
- GitHub environments (`staging`, `production`) and their rules can be managed with `gh api repos/<repo>/environments/<name>`.
- `.env` and `.dev.vars` are gitignored and only hold dummy local values. Committing them is blocked as credential leakage; keep them out.

## Known failure causes

- **Frontend returns `500` / `error code: 1101` on `/api` after a backend Worker was deleted and recreated**: the frontend Worker's service binding still points at the deleted Worker. Redeploy the frontend in that environment (frontend repo: CI/CD on `main` for staging, Deploy production for production); the first requests right after can still fail for a few seconds. Recreating a backend Worker also drops its secrets (`JWT_SECRET_KEY`) and, on staging, its Cloudflare Access settings.

- **"Staging/Production lost articles in the deploy"**: `scripts/count-articles.sh` counted fewer articles after the deploy than before. Usual causes: the Worker name in `wrangler.jsonc` does not match the Worker in Cloudflare (a new, empty Worker was created), or the Durable Object instance name (`DB_NAME` in `src/db/everise-db.ts`) changed without a data copy. Do not redeploy over it; roll back the Worker version in the dashboard and investigate. Cloudflare keeps 30 days of point-in-time recovery for the database.

- **Missing secrets**: a deploy step fails with "it's necessary to set a CLOUDFLARE_API_TOKEN". Fix on GitHub, then `gh run rerun --failed`.
- **Staging smoke test gets `302` to `*.cloudflareaccess.com`**: Cloudflare Access rejected the request; the smoke output says whether a service token was sent and accepted. The policy list that Access enforces is the one in Zero Trust → Access controls → Applications → `<worker> - Cloudflare Workers` → Policies, and it can differ from what the Worker's Access tab shows: saving that application's Additional settings (CORS, cookies) from a stale page once dropped the `CI service token` (Service Auth) policy. Ask the user for a screenshot of that Policies tab first. To see which Access application handles a host, decode the `aud` in the redirect's `meta` token and compare it with the AUD tag on the Worker's Access tab.
- **Smoke test gets `404` / `error code: 1042`**: a brand-new `workers.dev` hostname is not live yet. Only happens on a Worker's first deploy; re-run the job after a minute.
- **Thousands of `Delete ␍` prettier errors locally**: Windows CRLF checkout. `.gitattributes` forces LF; if files still have CR, after committing run `git rm -rq --cached . && git reset -q --hard`.
- **Random 422 in tests**: faker data failing request validation (zod) (e.g. `faker.internet.url()` producing a non-ASCII host). Use ASCII-safe generators such as `faker.internet.avatar()`.
- **Other one-off test failures**: usually random faker data colliding (e.g. two random articles sharing a tag, which the API deduplicates). Fix the test's expectation, not the API, and check the failure is not reproducible before blaming the change being pushed.
- **Free-plan caps**: daily request limits are shared by both Workers. A sudden 429/1027 on both points at quota, not code.
