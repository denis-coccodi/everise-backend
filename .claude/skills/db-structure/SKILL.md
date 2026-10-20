---
name: db-structure
description: Describes how the EveriseDb document store is laid out (the docs table, collections, fields, references, indexes, one-step operations) and how to update the database diagram in docs/. Use when answering questions about the data model, adding or changing a collection or field, or when the diagram or the README's Database section needs to change.
---

# Everise database structure

The whole database is one Durable Object instance, named `everise`, of the class `EveriseDb` (SQLite-backed, `src/db/everise-db.ts`), wrapping `SqlDocumentStore` (`src/db/sql-document-store.ts`).

- The instance name selects the storage: a different name is a different, empty database. Never change `DB_NAME` without a data copy.
- Durable Object migrations in `wrangler.jsonc` are applied once: never edit or remove one, add a new one.

- Table `docs`: `collection`, `id` (primary key together), `data` (the fields as JSON; dates as `{"$date": ms}`, bytes as `{"$bytes": base64}`, see `src/db/json-values.ts`), `created_at`, `updated_at` (ms). Table `meta`: one-time steps done (the key-value copy).
- On every start the Durable Object also runs `retireTataruAccount` (`src/waking-sands/retire-tataru-account.ts`): the old Tataru member account (`tataru@everise.invalid`), if still there, has its posts and pictures moved to `character:tataru` and is deleted.
- The store adds `id` (UUID), `createdAt`, `updatedAt` to every document. An update that changes no field keeps `updatedAt`.
- `find` is one SQL query (`==` via `json_extract`, `array-contains` via `json_each`, ORDER BY, LIMIT/OFFSET, ties by id). Field names are written into the SQL (checked as plain words) so SQLite can use the expression indexes; every filtered field must be in `INDEXED` (`src/db/sql-schema.ts`).
- Each call is atomic and `batch` is a transaction, but a read and a later write are two RPC calls: another request's calls can come between them. Use the one-step operations for anything that depends on what's stored: `addToSet`/`removeFromSet` (optionally capped at `max`, or creating the document), `takeLease` (a number field as a lease: one holder until it runs out), `increment` (dotted paths reach into objects), `createUnique` (groups of fields that must not repeat).
- References are plain ids; nothing enforces them. Services check existence.
- Tests use the same `SqlDocumentStore` on in-memory SQLite (`__tests__/utils/sqlite-storage.ts`, `node:sqlite`).
- No backup job exists. Durable Objects have 30-day point-in-time recovery, unused by the app.
- Not in this database: the market's price histories. Each item and region has its own `MarketHistoryHub` Durable Object (`src/market/market-hub.ts`, binding `MARKET`, named `<region>:<item id>`) whose SQLite storage holds `history_months` (one row per world and month: `days`, JSON keyed by each day's start, each day's all/nq/hq [median, min, max, sales, quantity] or null; rows, not bytes, count against the Free plan), `history_gaps` (windows of a world's sales still to read from Universalis, with the adaptive `span` of the next read) and `history_state` (`refreshedAt`, `readFrom`). Migration v4's first version kept `market_*` tables under other object names; those are left as they are. It can be rebuilt from Universalis at any time.

## Collections

The app's collections, their fields and the files that define them are in [collections.md](collections.md). Read it before answering a data-model question or changing a document's shape, and update it (with the diagram and the README's Database section) when a collection or field changes.

## Updating the diagram

`docs/db-structure.svg` is hand-written SVG (1200×2070) and is what the README embeds; `docs/db-structure.png` is rendered from it. After changing the SVG:

1. Render the PNG with headless Edge from PowerShell, in the repo root (Bash quoting of the Edge path fails):
   ```
   $repo = (Get-Location).Path
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,2070 "--screenshot=$repo\docs\db-structure.png" "file:///$($repo -replace '\\','/')/docs/db-structure.svg"
   ```
   Match `--window-size` to the SVG's width and height.
2. Read the PNG to check the layout visually (overlapping labels, crossing arrows) before committing.
3. Keep the README "Database" bullets in sync with the diagram.

## History

- October 2026: both environments' databases were recreated empty (namespaces `be-prod_EveriseDb`, `be-staging_EveriseDb`, migration `v1`).
- Until October 2026 documents were key-value entries `<collection>/<id>`. `src/db/key-value-copy.ts` copies them into the `docs` table once, on the Durable Object's first start, and leaves them as a backup.
