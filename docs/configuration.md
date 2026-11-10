---
title: Configuration and local development
nav_order: 6
---

# Configuration and local development

## Running locally

1. `npm install`.
2. Create `.dev.vars`:
   ```
   BASE_URL=http://localhost:8080
   CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
   JWT_SECRET_KEY=dummy-jwt-secret-key
   ```
3. `npm start`. The API runs on http://localhost:8080 with a local Durable Object.
4. Check it: `curl http://localhost:8080/api/tags`.

Notes:
- Add `RESEND_API_KEY=console` to print emails in the terminal.
- Local data survives restarts. Delete `.wrangler/state` to start from an empty database.
- Values in `.dev.vars` override the `vars` in `wrangler.jsonc`.
- On Windows, a stopped wrangler process can keep holding its port and hang requests. Use a fresh port and `127.0.0.1`.

## Settings

Plain settings are in `wrangler.jsonc`, per environment. Secrets are set with `npx wrangler secret put <NAME>`, with `--env staging` for staging.

| Variable | Purpose | Secret |
|---|---|---|
| `BASE_URL` | The site's URL; links, sign-in returns and upload URLs are built from it | |
| `LEGACY_BASE_URLS` | Earlier `BASE_URL`s; uploads saved under them show at the new address | |
| `CORS_ORIGINS` | Frontend origins allowed to call the API with the user's cookie | |
| `COOKIE_SAME_SITE` | `none` (default), `lax` or `strict` | |
| `JWT_SECRET_KEY` | Signs the JWTs | yes |
| `JWT_ISSUER`, `JWT_SECONDS_TO_EXPIRATION` | Token issuer and lifetime | |
| `ADMIN_EMAILS` | The admins | yes |
| `DUTIES_REFRESH_KEY` | Allows the game data refresh | yes |
| `CF_ACCESS_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ACCESS_POLICY_ID` | Keep the staging testers' Access policy in step (production only) | token |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in; the button is hidden without them | secret |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord sign-in | secret |
| `GIPHY_API_KEY` | GIF search | yes |
| `FFLOGS_CLIENT_ID` / `FFLOGS_CLIENT_SECRET` | The fight planner's FFLogs client | yes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emails and email confirmation | key |
| `TURNSTILE_SECRET_KEY` | The bot check | yes |
| `UPLOAD_STORAGE_MB` | Everyone's uploads together: 9,216 in production, 1,024 on staging | |
| `DISCORD_WEBHOOK_URL` | Posts to the Discord channel (production only) | yes |
| `DISCORD_GUILD_ID` | The server whose widget the home page shows | |
| `DISCORD_BOT_TOKEN` | Reads the relayed channels | yes |
| `DISCORD_WEEKLY_CHANNEL_ID`, `DISCORD_HUNTS_CHANNEL_ID`, `DISCORD_HUNT_SOURCES` | The relayed channels | |
| `FEATURES` | Feature flags switched on: `planner` on staging, none in production today | |
| `WAKING_SANDS_DAILY_NEURONS` | Workers AI budget per day: 8,000 in production, 1,500 on staging | |

## Testing

1. Create `.env` for Jest:
   ```
   BASE_URL=http://localhost:8080
   CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200
   JWT_SECRET_KEY=dummy-jwt-secret-key
   JWT_ISSUER=https://everisefc.com
   JWT_SECONDS_TO_EXPIRATION=86400
   ```
2. `npm test`.

- **What runs:** Jest runs the Express app in Node against in-memory SQLite (`node:sqlite`, the same store code as the Durable Object), so nothing else needs to be running.
- **Checks in the tests:** every answer is checked against its declared schema, and `__tests__/concurrency` fires requests together to prove the one-step database operations hold.
- **After the tests:** `npm test` also type-checks, lints, checks formatting (Prettier) and checks file sizes (`scripts/check-sizes.mjs`). It must exit 0 before pushing.

## Checking a running instance

```
sh scripts/smoke.sh create <base-url> /tmp/jar.txt   # register, post, upload, read them back
sh scripts/smoke.sh verify <base-url> /tmp/jar.txt   # after a restart or redeploy: still there?
```

Against staging, export `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` first. `npx wrangler tail` shows a deployed Worker's logs.
