import type {SqlValue} from './sql-document-store';

// The `docs` table, its indexes, and how fields are written in SQL.

// The columns the store keeps itself; any other field is in the JSON.
const COLUMNS: Record<string, string> = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

// The fields queries filter on, each with an index (per collection).
const INDEXED: Record<string, string[]> = {
  users: [
    'email',
    'username',
    'googleId',
    'facebookId',
    'microsoftId',
    'discordId',
  ],
  follows: ['followerId', 'followeeId'],
  articles: ['authorId', 'slug'],
  comments: ['articleId', 'authorId'],
  media: ['userId'],
  profileImages: ['userId'],
  emailConfirmations: ['userId'],
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS docs (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (collection, id)
  )`,
  'CREATE INDEX IF NOT EXISTS docs_by_created ON docs (collection, created_at)',
  // Which one-time steps (e.g. copying the old key-value data) have run.
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ...Object.values(INDEXED)
    .flat()
    .filter((field, i, all) => all.indexOf(field) === i)
    .map(
      field =>
        `CREATE INDEX IF NOT EXISTS docs_by_${field} ON docs (collection, ${fieldSql(field)})`,
    ),
];

// A field as SQL. Field names come from the code, never from requests, and
// must be literal for SQLite to use an index; they're checked all the same.
function fieldSql(field: string) {
  if (!/^\w+$/.test(field)) throw new Error(`Bad field name: ${field}`);
  return COLUMNS[field] ?? `json_extract(data, '$.${field}')`;
}

// JSON has no booleans in SQLite: json_extract gives 1 and 0.
function sqlValue(value: unknown): SqlValue {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return value;
  return null;
}

function fieldName(field: string) {
  if (!/^\w+$/.test(field)) throw new Error(`Bad field name: ${field}`);
  return field;
}

export {SCHEMA, fieldName, fieldSql, sqlValue};
