---
title: Admin
parent: Features
nav_order: 10
---

# Admin

Frontend: [Admin](/docs/frontend/features/admin.html). Players' guide: [site guide](/guide/).

Admins are whoever's email is in the `ADMIN_EMAILS` secret. The role is never stored, so the API can't give or remove it. Everything here is under `/api/admin` and answers 403 for anyone else.

## Members

- **`GET /api/admin/users`:** lists members with their username, email, picture, role, sign-in methods and whether their email is confirmed.
  - `search` matches username or email, in any case; `limit` (1–100) and `offset` page through them.
  - `stagingAccessConnected` says whether this backend can sync staging access.
- **`PUT /api/admin/users/:id/role`:** makes a member a `staging-tester` or a `user`. Changing an admin's role is refused (422).
- **`DELETE /api/admin/users/:id`:** deletes a member for good, as the privacy policy promises when someone asks.
  - It removes their account, posts (with every comment on them), comments elsewhere, favourites, follows both ways and uploaded pictures, in one batch (`src/admin/member-deletion.ts`).
  - Their sessions stop working.
  - Admins can't be deleted this way.

## Staging access

- **Sync:** after every role change, the backend writes the admins' and staging testers' emails into the reusable Cloudflare Access policy that guards staging (`src/admin/staging-access.ts`). `POST /api/admin/staging-access` writes them again.
- **Production only:** only production has the Cloudflare settings (`CF_ACCESS_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ACCESS_POLICY_ID`). On staging, the answer says staging access isn't connected, which is expected: manage roles from production.
- **Failures:** the role is saved even if Cloudflare can't be reached.

## Waking Sands characters

Admins edit each character's title, personality, profile bio and picture (see [The Waking Sands](waking-sands.md)). Tataru's picture and title also show on the roulette results she posts for guests.
