---
name: db-structure
description: How the ConduitDb document store is laid out (collections, fields, references, query model) and how to update the database diagram in docs/. Use when answering questions about the data model, adding or changing a collection or field, or when the diagram or the README's Database section needs to change.
---

# Conduit database structure

The whole database is one Durable Object, `ConduitDb` (SQLite-backed, `src/db/conduit-db.ts`), wrapping `DocumentStore` (`src/db/document-store.ts`).

- Key: `<collection>/<id>`; value: the JSON document.
- The store adds `id` (UUID), `createdAt`, `updatedAt` to every document. An update that changes no field keeps `updatedAt`.
- `find` lists by key prefix, then filters (`==`, `array-contains`), sorts and paginates in memory. No indexes.
- Requests to the Durable Object are serialized, so read-then-write uniqueness checks (username, email, slug) are safe.
- References are plain ids; nothing enforces them. Services check existence.
- Tests use the same `DocumentStore` on in-memory storage (`__tests__/utils/memory-storage.ts`).
- No backup job exists. Durable Objects have 30-day point-in-time recovery, unused by the app.

| Collection | Fields (besides id/createdAt/updatedAt) | Defined in |
| --- | --- | --- |
| `users` | email, username, passwordHash, bio?, image? | `src/users/users-service.ts` (`UserDoc`) |
| `follows` | followerId → users, followeeId → users | `src/profiles/profiles-service.ts` |
| `articles` | authorId → users, slug (unique), title, description, body, tags[], favoritedBy[] → users | `src/articles/articles-service.ts` (`ArticleDoc`) |
| `comments` | articleId → articles, authorId → users, body | `src/articles/articles-service.ts` (`CommentDoc`) |

Tags and favorites have no collection of their own; they are arrays on articles.

Verify this table against the `*Doc` interfaces and `this.db.create(...)` calls before relying on it.

## Updating the diagram

`docs/db-structure.svg` is hand-written SVG (1200×830) and is what the README embeds; `docs/db-structure.png` is rendered from it. After changing the SVG:

1. Render the PNG with headless Edge from PowerShell (Bash quoting of the Edge path fails):
   ```
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,830 "--screenshot=C:\dev\conduit-social\typescript-cloudflare-backend\docs\db-structure.png" "file:///C:/dev/conduit-social/typescript-cloudflare-backend/docs/db-structure.svg"
   ```
   Match `--window-size` to the SVG's width and height.
2. Read the PNG to check the layout visually (overlapping labels, crossing arrows) before committing.
3. Keep the README "Database" bullets in sync with the diagram.
