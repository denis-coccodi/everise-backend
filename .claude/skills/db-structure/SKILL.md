---
name: db-structure
description: How the EveriseDb document store is laid out (collections, fields, references, query model) and how to update the database diagram in docs/. Use when answering questions about the data model, adding or changing a collection or field, or when the diagram or the README's Database section needs to change.
---

# Everise database structure

The whole database is one Durable Object instance, named `everise`, of the class `EveriseDb` (SQLite-backed, `src/db/everise-db.ts`), wrapping `DocumentStore` (`src/db/document-store.ts`).

- The instance name selects the storage: a different name is a different, empty database. Never change `DB_NAME` without a data copy.
- Both environments' databases were recreated empty in October 2026 (namespaces `be-prod_EveriseDb`, `be-staging_EveriseDb`); `wrangler.jsonc` has one migration, `v1`. Applied migrations must never be edited or removed: add new ones.

- Key: `<collection>/<id>`; value: the JSON document.
- The store adds `id` (UUID), `createdAt`, `updatedAt` to every document. An update that changes no field keeps `updatedAt`.
- `find` lists by key prefix, then filters (`==`, `array-contains`), sorts and paginates in memory. No indexes.
- Requests to the Durable Object are serialized, so read-then-write uniqueness checks (username, email) are safe.
- References are plain ids; nothing enforces them. Services check existence.
- Tests use the same `DocumentStore` on in-memory storage (`__tests__/utils/memory-storage.ts`).
- No backup job exists. Durable Objects have 30-day point-in-time recovery, unused by the app.

| Collection | Fields (besides id/createdAt/updatedAt) | Defined in |
| --- | --- | --- |
| `users` | email, username, passwordHash? (unset: signs in only through a provider), googleId?, facebookId?, microsoftId?, discordId? (the provider accounts tied to it), bio?, image?, darkMode? (unset: dark), role? (`staging-tester`; unset: user; admins come from `ADMIN_EMAILS`, never stored), system? (an account the app posts as: Tataru), emailConfirmed? (false until a password sign-up opens its link; unset: confirmed), pendingEmail? (a new address waiting for its link) | `src/users/users-service.ts` (`UserDoc`) |
| `follows` | followerId → users, followeeId → users | `src/profiles/profiles-service.ts` |
| `articles` | authorId → users, slug? (only on posts from before ids were in links, so their old links still work), title, description, body, tags[], favoritedBy[] → users, media? (up to 4 attachments: image, gif or YouTube video; unset on posts from before, whose media is in the body), roulette? (a roulette result card) | `src/articles/articles-service.ts` (`ArticleDoc`) |
| `comments` | articleId → articles, authorId → users, body, media? (one attachment) | `src/articles/articles-service.ts` (`CommentDoc`) |
| `media` | userId → users, contentType, width, height, data (≤ 1 MB), uploadedAt (ms, the daily limit), attached? (false until a post or comment uses it; swept a day later) | `src/media/media-service.ts` (`MediaDoc`) |
| `emailConfirmations` | userId → users, email (the address the link went to), tokenHash (SHA-256), expiresAt, lastSentAt, sendsToday, dayStartedAt (one per account; deleted when opened) | `src/users/email-confirmation.ts` (`ConfirmationDoc`) |
| `postLimits` | lastPostAt?, or windowStart? and count? (id: `user-<id>`, `guest-<hashed address>`, `guests`) | `src/roulette-posts/roulette-posts-service.ts` |
| `profileImages` | userId → users, contentType, data (bytes, ≤ 300 KB); `users.image` holds its URL | `src/users/profile-images-service.ts` (`ProfileImageDoc`) |
| `chatUsage` | neurons, members ({users.id: Neurons}) (id: the UTC day, `YYYY-MM-DD`; the Waking Sands daily limits) | `src/waking-sands/waking-sands-service.ts` (`UsageDoc`) |

Tags and favorites have no collection of their own; they are arrays on articles.

Verify this table against the `*Doc` interfaces and `this.db.create(...)` calls before relying on it.

## Updating the diagram

`docs/db-structure.svg` is hand-written SVG (1200×1246) and is what the README embeds; `docs/db-structure.png` is rendered from it. After changing the SVG:

1. Render the PNG with headless Edge from PowerShell, in the repo root (Bash quoting of the Edge path fails):
   ```
   $repo = (Get-Location).Path
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,1246 "--screenshot=$repo\docs\db-structure.png" "file:///$($repo -replace '\\','/')/docs/db-structure.svg"
   ```
   Match `--window-size` to the SVG's width and height.
2. Read the PNG to check the layout visually (overlapping labels, crossing arrows) before committing.
3. Keep the README "Database" bullets in sync with the diagram.
