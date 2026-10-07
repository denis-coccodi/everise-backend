---
name: db-structure
description: How the EveriseDb document store is laid out (collections, fields, references, query model) and how to update the database diagram in docs/. Use when answering questions about the data model, adding or changing a collection or field, or when the diagram or the README's Database section needs to change.
---

# Everise database structure

The whole database is one Durable Object instance, named `everise`, of the class `EveriseDb` (SQLite-backed, `src/db/everise-db.ts`), wrapping `SqlDocumentStore` (`src/db/sql-document-store.ts`).

- The instance name selects the storage: a different name is a different, empty database. Never change `DB_NAME` without a data copy.
- Both environments' databases were recreated empty in October 2026 (namespaces `be-prod_EveriseDb`, `be-staging_EveriseDb`); `wrangler.jsonc` has one migration, `v1`. Applied migrations must never be edited or removed: add new ones.

- Table `docs`: `collection`, `id` (primary key together), `data` (the fields as JSON; dates as `{"$date": ms}`, bytes as `{"$bytes": base64}`, see `src/db/json-values.ts`), `created_at`, `updated_at` (ms). Table `meta`: one-time steps done (the key-value copy).
- Before the SQL table (until October 2026) documents were key-value entries `<collection>/<id>`; `src/db/key-value-copy.ts` copies them once on the Durable Object's first start and leaves them as a backup.
- The store adds `id` (UUID), `createdAt`, `updatedAt` to every document. An update that changes no field keeps `updatedAt`.
- `find` is one SQL query (`==` via `json_extract`, `array-contains` via `json_each`, ORDER BY, LIMIT/OFFSET, ties by id). Field names are written into the SQL (checked as plain words) so SQLite can use the expression indexes; every filtered field must be in `INDEXED`.
- Each call is atomic and `batch` is a transaction, but a read and a later write are two RPC calls: another request's calls can come between them. Use the one-step operations for anything that depends on what's stored: `addToSet`/`removeFromSet` (optionally capped at `max`, or creating the document), `takeLease` (a number field as a lease: one holder until it runs out), `increment` (dotted paths reach into objects), `createUnique` (groups of fields that must not repeat).
- References are plain ids; nothing enforces them. Services check existence.
- Tests use the same `SqlDocumentStore` on in-memory SQLite (`__tests__/utils/sqlite-storage.ts`, `node:sqlite`).
- No backup job exists. Durable Objects have 30-day point-in-time recovery, unused by the app.

| Collection | Fields (besides id/createdAt/updatedAt) | Defined in |
| --- | --- | --- |
| `users` | email, username, passwordHash? (unset: signs in only through a provider), googleId?, facebookId?, microsoftId?, discordId? (the provider accounts tied to it), bio?, image?, darkMode? (unset: dark), role? (`staging-tester`; unset: user; admins come from `ADMIN_EMAILS`, never stored), system? (an account the app posts as: Tataru), emailConfirmed? (false until a password sign-up opens its link; unset: confirmed), pendingEmail? (a new address waiting for its link) | `src/users/user-doc.ts` (`UserDoc`) |
| `follows` | followerId → users, followeeId → users | `src/profiles/profiles-service.ts` |
| `articles` | authorId → users, slug? (only on posts from before ids were in links, so their old links still work), title, description, body, tags[], favoritedBy[] → users, media? (up to 4 attachments: image, gif or YouTube video; unset on posts from before, whose media is in the body), roulette? (a roulette result card) | `src/articles/article-docs.ts` (`ArticleDoc`) |
| `comments` | articleId → articles, authorId → users, body, media? (one attachment) | `src/articles/article-docs.ts` (`CommentDoc`) |
| `media` | userId → users, contentType, width, height, data (≤ 1 MB), uploadedAt (ms, the daily limit), attached? (false until a post or comment uses it; swept a day later) | `src/media/media-service.ts` (`MediaDoc`) |
| `emailConfirmations` | userId → users, email (the address the link went to), tokenHash (SHA-256), expiresAt, lastSentAt, sendsToday, dayStartedAt (one per account; deleted when opened) | `src/users/email-confirmation.ts` (`ConfirmationDoc`) |
| `postLimits` | lastPostAt?, or windowStart? and count? (id: `user-<id>`, `guest-<hashed address>`, `guests`) | `src/roulette-posts/roulette-posts-service.ts` |
| `profileImages` | userId → users (or `character:<id>` for a Waking Sands character's picture), contentType, data (bytes, ≤ 300 KB); `users.image` holds its URL | `src/users/profile-images-service.ts` (`ProfileImageDoc`) |
| `characters` | title?, persona?, image? (an uploaded picture's URL; the file is a `profileImages` document owned by `character:<id>`) (id: the character's id, e.g. `barnaby`; unset fields keep the default from `characters.ts`) | `src/waking-sands/characters-service.ts` (`CharacterDoc`) |
| `sandsLines` | at (ms, strictly increasing), from (`member`, `note` or a character id), name, image?, userId? → users (a member's line), text (the room's last day, at most 200; older ones deleted on write) | `src/waking-sands/sands-docs.ts` (`LineDoc`) |
| `sandsRoom` | present[] (character ids), busyUntil (ms; a round of answers is running) (one document, id `room`) | `src/waking-sands/sands-docs.ts` (`RoomDoc`) |
| `chatUsage` | neurons, members ({users.id: Neurons}) (id: the UTC day, `YYYY-MM-DD`; the Waking Sands daily limits) | `src/waking-sands/sands-docs.ts` (`UsageDoc`) |

Tags and favorites have no collection of their own; they are arrays on articles.

Verify this table against the `*Doc` interfaces and `this.db.create(...)` calls before relying on it.

## Updating the diagram

`docs/db-structure.svg` is hand-written SVG (1200×1486) and is what the README embeds; `docs/db-structure.png` is rendered from it. After changing the SVG:

1. Render the PNG with headless Edge from PowerShell, in the repo root (Bash quoting of the Edge path fails):
   ```
   $repo = (Get-Location).Path
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,1486 "--screenshot=$repo\docs\db-structure.png" "file:///$($repo -replace '\\','/')/docs/db-structure.svg"
   ```
   Match `--window-size` to the SVG's width and height.
2. Read the PNG to check the layout visually (overlapping labels, crossing arrows) before committing.
3. Keep the README "Database" bullets in sync with the diagram.
