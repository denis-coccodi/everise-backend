---
name: deploy
description: Ship this repo to Cloudflare Workers (staging, then production) through the GitHub Actions pipeline, or by hand with wrangler, and diagnose failing CI/CD runs. Use when asked to deploy, push and deploy, check or re-run the pipeline, or fix a red build.
---

# Deploy the Conduit backend

Repo: `denis-coccodi/typescript-cloudflare-conduit-backend`, branch `main`. Cloudflare account ID: `ba2955b2991a5a38d46bc4144212e9cc`.

| Environment | Worker | URL | wrangler |
| --- | --- | --- | --- |
| staging | `conduit-staging` | https://conduit-staging.denis-coccodi.workers.dev | `npx wrangler deploy --env staging` |
| production | `conduit` | https://conduit.denis-coccodi.workers.dev | `npx wrangler deploy` (`npm run deploy`) |

Each Worker has its own Durable Object, so its own data. Staging is defined under `env.staging` in `wrangler.jsonc`; `durable_objects` and `vars` are not inherited from the top level, so any new binding or var must be added in both places.

## Normal path: push to main

`.github/workflows/ci-cd.yaml` (**CI/CD**, every push and PR):
- **test**: `npm ci` then `npm test`, which also runs `tsc --noEmit` and `gts lint` via `posttest`. Test env vars are set in the workflow; `.env` is not committed.
- **deploy-staging** (push to `main`, after test): deploys staging, runs `scripts/smoke.sh create` against it, and writes a link to the production workflow in the run summary. GitHub environment `staging`, limited to `main`.

`.github/workflows/deploy-production.yaml` (**Deploy production**, `workflow_dispatch` only):
- First checks that `GITHUB_SHA` has a successful CI/CD push run (`gh run list --commit ... --status success`); otherwise fails without deploying.
- Then `wrangler deploy` and a curl of `/api/tags`. GitHub environment `production`, limited to `main`, no reviewers.

Production deploys are the user's decision: they start it from Actions → Deploy production → **Run workflow**. Only start it yourself (`gh workflow run deploy-production.yaml --ref main`) when the user explicitly asks for a production deploy, and only after the commit's CI/CD run is green.

Before pushing, run `npm test` locally; it must end with exit code 0, not just passing Jest.

After pushing, wait for the run and report each job:
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
- GitHub secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are set by the user. Writing them with `gh secret set` is blocked by the permission classifier, so give the user the exact steps instead: Cloudflare dashboard → API Tokens → "Edit Cloudflare Workers" template → Account Resources: their account, Zone Resources: all zones from the account → create, then repo Settings → Secrets and variables → Actions. Never ask them to paste the token into chat.
- GitHub environments (`staging`, `production`) and their rules can be managed with `gh api repos/<repo>/environments/<name>`.
- `.env` and `.dev.vars` are gitignored and only hold dummy local values. Committing them is blocked as credential leakage; keep them out.

## Known failure causes

- **Missing secrets**: a deploy step fails with "it's necessary to set a CLOUDFLARE_API_TOKEN". Fix on GitHub, then `gh run rerun --failed`.
- **Smoke test gets `404` / `error code: 1042`**: a brand-new `workers.dev` hostname is not live yet. Only happens on a Worker's first deploy; re-run the job after a minute.
- **Thousands of `Delete ␍` prettier errors locally**: Windows CRLF checkout. `.gitattributes` forces LF; if files still have CR, after committing run `git rm -rq --cached . && git reset -q --hard`.
- **Random 422 in tests**: faker data failing Joi validation (e.g. `faker.internet.url()` producing a non-ASCII host). Use ASCII-safe generators such as `faker.internet.avatar()`.
- **Free-plan caps**: daily request limits are shared by both Workers. A sudden 429/1027 on both points at quota, not code.
