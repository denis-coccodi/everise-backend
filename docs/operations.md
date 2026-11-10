---
title: Operations
nav_order: 7
---

# Operations

## Environments

| Part | Production | Staging |
|---|---|---|
| Frontend Worker | `prod` at https://everise.dev | `staging` at https://staging.everise.dev |
| Backend Worker | `be-prod` at https://apis.everise.dev | `be-staging` at https://staging.apis.everise.dev |
| Images (R2) | `everise-images` | `everise-images-staging` |
| Who can open it | everyone | allowed emails only (Cloudflare Access) |
| Feature flags | released only | everything being built (`planner`) |

- **Old addresses:** `prod.everisefc.workers.dev` and `staging.everisefc.workers.dev` still work. `LEGACY_BASE_URLS` makes uploads saved under them show at the new address (`src/site-urls.ts`).
- **One account, shared limits:** both environments run on one Cloudflare account and share its daily limits (100,000 Worker requests and 100,000 Durable Object requests a day, among others). Heavy traffic on staging uses up production's allowance, so never load-test staging.
- **R2 is billed past its allowance:** its included allowance is monthly (10 GB, 1M writes, 10M reads), and past it R2 bills instead of refusing. Keep a billing notification on the account.

## Branches and pull requests

Trunk-based: `main` is the only long-lived branch and must always be deployable. It rejects direct pushes, admins included.

1. Branch from `main`: `feature/<name>`, `bugfix/<description>`, or `hotfix/<description>` when production is broken. Commit messages follow Conventional Commits (`fix(events): …`).
2. Push as often as you like; pushing deploys nothing.
3. Open a pull request to `main`. The `test` check runs on it.
4. Merge once `test` passes and the branch is up to date. The merge deploys staging.

Work that spans several PRs merges switched off in production behind `FEATURES` (see [Architecture](architecture.md#feature-flags)).

## GitHub Actions

### Test and deploy staging (`ci-cd.yaml`)
Runs on pushes to `main`, on pull requests, and by hand.

1. **test:** `npm test`, which runs the tests, type-check, lint, format and size checks.
2. **deploy-staging** (pushes to `main` and manual runs):
   - runs `wrangler deploy --env staging`, then `scripts/smoke.sh` against staging;
   - the smoke test registers a user. With email confirmation on, it checks that sign-in waits for the link; otherwise it posts and uploads, then reads both back.

Each run leaves one smoke-test user in the staging database and sends one email. **To try a branch on staging:** run the workflow by hand on that branch. The next merge to `main` puts `main` back.

### Deploy production (`deploy-production.yaml`)

- Runs by hand only.
- Deploys the latest commit on `main` and checks that the API responds.
- Tags the commit `prod-YYYY-MM-DD-HHMM` (UTC), so the latest `prod-*` tag is what production runs.
- Refuses a commit whose staging run didn't succeed. The `production` GitHub environment only accepts `main`.

### Refresh game data from XIVAPI (`refresh-game-data.yaml`)

- Runs by hand, by the repository owner only, for staging or production (production only from `main`).
- Calls `POST /api/duties/refresh`, then `POST /api/duties/refresh/images` until every image is downloaded. Then it rebuilds the planner's action catalog.
- Run it after every game patch.

### Dependabot
Opens update PRs every Monday: one for all minor and patch updates, and one per major update. They're merged like any PR once `test` passes.

### Deploying production

1. Merge into `main` and wait for **Test and deploy staging** to go green.
2. Optionally, try the change on staging.
3. Actions → **Deploy production** → Run workflow on `main`.

**Hotfixes:** a production fix is normally a `hotfix/` branch merged into `main` and deployed as usual. If `main` holds work that can't go to production yet, the hotfix starts from the latest `prod-*` tag instead (`trunk-based` skill).

**Order between the two repositories:**

- Deploy the backend first when the frontend needs a new endpoint or field.
- Deploy the frontend first when the backend starts requiring something new from it (Turnstile, for example).

**From a laptop:** `npx wrangler deploy --env staging`, or `npm run deploy` for production, after `npx wrangler login`.

## Staging access

Staging (frontend `staging` and backend `be-staging`) is behind Cloudflare Access. Only allowed emails can open it, after a one-time code sent by email.

### Getting in

- **Browser:** open https://staging.apis.everise.dev once and log in, then use https://staging.everise.dev.
- **CI and scripts:** use an Access service token, `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.

### Testers

- Both staging applications use one reusable Allow policy (`Staging Testers`).
- After every role change, the **production** backend writes the admins' and staging testers' emails into that policy (`src/admin/staging-access.ts`). `POST /api/admin/staging-access` writes them again.
- Only production has the Cloudflare settings. A second backend writing its own testers would undo the first.

### Setting it up

1. Create a service token (`github-actions-staging`) and store it as the repository secrets.
2. Enable Access on `be-staging` (workers.dev and preview URLs) and add `staging.apis.everise.dev`. Policies: Allow `Staging Testers`, and Service Auth for the token.
3. In the same application, set CORS:
   - origins `https://staging.everise.dev`, `https://staging.everisefc.workers.dev` and `http://localhost:4200`;
   - allow credentials;
   - bypass OPTIONS requests to origin;
   - cookie SameSite None.
4. Enable Access on the `staging` frontend and add `staging.everise.dev`, with the same Allow policy.
5. Re-run the latest staging deploy and check that the smoke test passes.

Do steps 1 and 2's Service Auth policy **before** enabling Access on the backend, or the next smoke test fails.

## One-time setup

Secrets are set per Worker with `npx wrangler secret put <NAME>`, adding `--env staging` for staging or `--name be-prod` for production only. They persist across deploys.

1. **Cloudflare:**
   - create the account and a `workers.dev` subdomain;
   - set `BASE_URL` and `CORS_ORIGINS` in `wrangler.jsonc`, and the URLs in `ci-cd.yaml`;
   - set a different random `JWT_SECRET_KEY` on each Worker;
   - enable R2 and create `everise-images` and `everise-images-staging` (a deploy fails while one is missing);
   - create an API token from the **Edit Cloudflare Workers** template.
2. **GitHub:**
   - repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`;
   - environments `staging` (any branch) and `production` (`main` only), each with its `DUTIES_REFRESH_KEY`.
3. **Admins:** `ADMIN_EMAILS` on each Worker.
4. **Staging testers:**
   - create the reusable `Staging Testers` Access policy;
   - on production only, set a custom Cloudflare token with **Access: Apps and Policies → Edit** as `CF_ACCESS_API_TOKEN`, plus `CF_ACCOUNT_ID` and `CF_ACCESS_POLICY_ID`;
   - then run **Sync staging access** in the admin settings.
5. **Google sign-in:** OAuth consent screen (External, published), then an OAuth client ID with redirect `<site>/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. **Discord sign-in:** a Developer Portal application with redirect `<site>/api/auth/discord/callback`. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`. One app per provider can list both environments' redirects.
7. **Email:**
   - add `everise.dev` at Resend (EU region) and add its DKIM and SPF records in Cloudflare DNS (DNS only);
   - verify, create a sending key and set `RESEND_API_KEY`;
   - optionally add a DMARC record, and Cloudflare Email Routing for receiving mail.
8. **Turnstile:** a widget for `everise.dev` and `staging.everise.dev` in Managed mode. The site key goes in the frontend's environments; set `TURNSTILE_SECRET_KEY` on each Worker.
9. **GIPHY:** create an app with **API** (not SDK) and set `GIPHY_API_KEY`. A beta key allows 100 searches an hour.
10. **FFLogs:** create an API client (not public) and set `FFLOGS_CLIENT_ID` and `FFLOGS_CLIENT_SECRET`.
11. **Discord:**
    - a webhook on the announcements channel, as `DISCORD_WEBHOOK_URL` (production only);
    - turn on the server widget;
    - the bot token as `DISCORD_BOT_TOKEN`.

## Backups

No backup job runs. SQLite-backed Durable Objects keep 30 days of point-in-time recovery, which the app doesn't use yet.
