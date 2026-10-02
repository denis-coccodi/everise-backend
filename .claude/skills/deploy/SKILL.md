---
name: deploy
description: Ship this repo to Cloudflare Workers through the GitHub Actions pipeline, or by hand with wrangler, and diagnose failing CI/CD runs. Use when asked to deploy, push and deploy, check or re-run the pipeline, or fix a red build.
---

# Deploy the Conduit backend

Repo: `denis-coccodi/typescript-cloudflare-conduit-backend`, branch `main`. Worker: `conduit` at https://conduit.denis-coccodi.workers.dev. Cloudflare account ID: `ba2955b2991a5a38d46bc4144212e9cc`.

## Normal path: push to main

`.github/workflows/ci-cd.yaml` has two jobs:
- **test** (every push and PR): `npm ci` then `npm test`, which also runs `tsc --noEmit` and `gts lint` via `posttest`. Test env vars are set in the workflow; `.env` is not committed.
- **deploy** (push to `main` only, after test passes): `npx wrangler deploy` with repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Before pushing, run `npm test` locally; it must end with exit code 0, not just passing Jest.

After pushing, wait for the run and report each job:
```
gh run list --limit 1
gh run view <id>                     # job summary
gh run view <id> --log-failed        # only the failing step
gh run rerun <id> --failed           # after fixing secrets or a flaky test
```
The Jest log is noisy (expected `console.error` output from error-path tests). Search the saved log for `FAIL `, `● ` (excluding `● Console`), `Tests:` and `error` lines instead of reading it all.

Confirm a deploy with the `Current Version ID` line in the deploy job log and `curl https://conduit.denis-coccodi.workers.dev/api/tags` (expect 200).

## Manual deploy

`npm run deploy` works from this machine (wrangler is logged in with OAuth; check with `npx wrangler whoami`).

## Secrets

- `JWT_SECRET_KEY` is a Worker secret, set once with `npx wrangler secret put JWT_SECRET_KEY`. It survives deploys; the pipeline does not upload it. Check with `npx wrangler secret list`.
- GitHub secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) are set by the user. Writing them with `gh secret set` is blocked by the permission classifier, so give the user the exact steps instead: Cloudflare dashboard → API Tokens → "Edit Cloudflare Workers" template → Account Resources: their account, Zone Resources: all zones from the account → create, then repo Settings → Secrets and variables → Actions. Never ask them to paste the token into chat.
- `.env` and `.dev.vars` are gitignored and only hold dummy local values. Committing them is blocked as credential leakage; keep them out.

## Known failure causes

- **Missing secrets**: deploy step fails with "it's necessary to set a CLOUDFLARE_API_TOKEN". Fix on GitHub, then `gh run rerun --failed`.
- **Thousands of `Delete ␍` prettier errors locally**: Windows CRLF checkout. `.gitattributes` forces LF; if files still have CR, after committing run `git rm -rq --cached . && git reset -q --hard`.
- **Random 422 in tests**: faker data failing Joi validation (e.g. `faker.internet.url()` producing a non-ASCII host). Use ASCII-safe generators such as `faker.internet.avatar()`.
