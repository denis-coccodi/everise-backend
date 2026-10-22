---
name: deploy
description: Ships the Everise backend to Cloudflare Workers (staging on every merge to main, production by hand) through the GitHub Actions pipeline or wrangler, manages its secrets, and diagnoses failing CI/CD runs. Use when asked to deploy, push and deploy, check or re-run the pipeline, set a secret, or fix a red build.
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

`.github/workflows/ci-cd.yaml` (**Test and deploy staging**: push to `main`, PRs, and `workflow_dispatch` on any branch):
- **test**: `npm ci` then `npm test`, which also runs `tsc --noEmit` and `gts lint` via `posttest`. Test env vars are set in the workflow; `.env` is not committed.
- **deploy-staging** (after test, on push to `main` or a manual run): deploys staging with message `<branch>@<sha>`, runs `scripts/smoke.sh create` against it, and writes a summary (on `main`, with a link to the production workflow). GitHub environment `staging`, any branch. Job-level `concurrency: deploy-staging` serializes deploys.
- Deploy another branch to staging: `gh workflow run ci-cd.yaml --ref <branch>` (or Actions → Test and deploy staging → Run workflow). There is one staging Worker, so this replaces what is there until the next merge to `main`. Tell the user which branch staging is now running.

`.github/workflows/deploy-production.yaml` (**Deploy production**, `workflow_dispatch` only):
- First checks that `GITHUB_SHA` has a successful Test and deploy staging push run (`gh run list --commit ... --status success`); otherwise fails without deploying.
- Then `wrangler deploy`, a curl of `/api/tags` and the article count check, and finally tags the commit `prod-YYYY-MM-DD-HHMM` (UTC) and pushes the tag (`contents: write`). GitHub environment `production`, limited to `main`, no reviewers.
- The latest `prod-*` tag is what production runs: `git fetch --tags && git tag --list 'prod-*' --sort=-creatordate | head -1`; `git log --oneline <tag>..origin/main` is what the next deploy would add. Features still being built are switched off in production by `FEATURES` (the `trunk-based` skill), so deploying `main` doesn't release them.

Production deploys are the user's decision: they start it from Actions → Deploy production → **Run workflow**. Only start it yourself (`gh workflow run deploy-production.yaml --ref main`) when the user explicitly asks for a production deploy, and only after the commit's Test and deploy staging run is green.

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

Wrangler on this machine is logged in with OAuth (`npx wrangler whoami`). Deploying production by hand skips the "passed staging" check, so only do it when the user explicitly asks for a manual production deploy. Deploy with `--message "<branch>@<short sha>"` and tag the commit `prod-YYYY-MM-DD-HHMM` yourself, as the workflow would (a hotfix from a `prod-*` tag: the `trunk-based` skill).

## Secrets

- `JWT_SECRET_KEY` is a Worker secret on each Worker, set once with `npx wrangler secret put JWT_SECRET_KEY [--env staging]`. It survives deploys; the pipeline does not upload it. Check with `npx wrangler secret list [--env staging]`. A random value can be piped in without printing it: `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64'))" | npx wrangler secret put JWT_SECRET_KEY --env <env>`.
- `DUTIES_REFRESH_KEY` allows `POST /api/duties/refresh`. It is set twice per environment, with the same value: as a Worker secret (`npx wrangler secret put DUTIES_REFRESH_KEY [--env staging]`) and as a GitHub environment secret (`staging` / `production`) read by the **Refresh game data from XIVAPI** workflow. The workflow's 401 error means the two differ or the Worker secret is unset. The user sets the GitHub one; a random value can go to both by piping the same value, but never print it.
- GitHub secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are set by the user. Writing them with `gh secret set` is blocked by the permission classifier, so give the user the exact steps instead: Cloudflare dashboard → API Tokens → "Edit Cloudflare Workers" template → Account Resources: their account, Zone Resources: all zones from the account → create, then repo Settings → Secrets and variables → Actions. Never ask them to paste the token into chat.
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (repository secrets, set by the user): the Cloudflare Access service token the staging smoke test sends. Staging is behind Access (README → Staging access); if the smoke test starts failing with 302/403, the token is missing, expired, or not in the Access application's Service Auth policy. Zero Trust settings are dashboard-only for the user; wrangler's OAuth login has no Access scopes.
- GitHub environments (`staging`, `production`) and their rules can be managed with `gh api repos/<repo>/environments/<name>`.
- `.env` and `.dev.vars` are gitignored and only hold dummy local values. Committing them is blocked as credential leakage; keep them out.

## When something fails

Read the failing step first (`gh run view <id> --log-failed`), then look it up in [troubleshooting.md](troubleshooting.md): lost data after a deploy, missing secrets, Cloudflare Access refusing the smoke test, new `workers.dev` hostnames, Windows line endings, flaky tests and Free-plan caps.
