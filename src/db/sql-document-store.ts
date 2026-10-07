import {randomUUID} from 'crypto';
import {Db, Doc, DocData, FindOptions, Where, Write} from './db';
import {Json, decode, encode} from './json-values';
import {SCHEMA, fieldName, fieldSql, sqlValue} from './sql-schema';

type SqlValue = string | number | null;

// The subset of the Durable Object SQL storage API the store relies on
// (ctx.storage in the Durable Object, node:sqlite in tests).
interface SqlStorage {
  readonly sql: {
    exec(
      query: string,
      ...bindings: SqlValue[]
    ): {toArray(): Record<string, unknown>[]};
  };
  transactionSync<T>(fn: () => T): T;
}

interface Row {
  id: string;
  data: string;
  created_at: number;
  updated_at: number;
}

// The database: every document is a row of the `docs` table, its fields as
// JSON next to the id and dates the store manages. Queries are SQL, with an
// index for each field a service filters on (INDEXED) and for the creation
// date. Runs inside the EveriseDb Durable Object, whose SQLite storage is
// strongly consistent; each call is one synchronous step, so no other
// request runs in the middle of it.
class SqlDocumentStore implements Db {
  constructor(private readonly storage: SqlStorage) {
    for (const statement of SCHEMA) this.exec(statement);
  }

  async get<T extends Doc>(collection: string, id: string) {
    return this.read<T>(collection, id);
  }

  async find<T extends Doc>(collection: string, options: FindOptions = {}) {
    const conditions = ['collection = ?'];
    const bindings: SqlValue[] = [collection];
    for (const where of options.where ?? []) {
      conditions.push(this.condition(where));
      bindings.push(sqlValue(where.value));
    }
    const order = [
      ...(options.orderBy ?? []).map(
        ({field, direction}) =>
          `${fieldSql(field)} ${direction === 'asc' ? 'ASC' : 'DESC'}`,
      ),
      // Ties keep the order the key-value store listed them in.
      'id ASC',
    ];
    let query = `SELECT * FROM docs WHERE ${conditions.join(' AND ')} ORDER BY ${order.join(', ')}`;
    if (options.limit !== undefined || options.offset !== undefined) {
      query += ' LIMIT ? OFFSET ?';
      bindings.push(options.limit ?? -1, options.offset ?? 0);
    }
    return this.rows(query, ...bindings).map(row => this.toDoc<T>(row));
  }

  async create<T extends Doc>(collection: string, data: DocData) {
    const now = new Date();
    return this.write<T>(collection, randomUUID(), data, now, now);
  }

  async set<T extends Doc>(collection: string, id: string, data: DocData) {
    const now = new Date();
    const createdAt = this.read(collection, id)?.createdAt ?? now;
    return this.write<T>(collection, id, data, createdAt, now);
  }

  async update<T extends Doc>(collection: string, id: string, data: DocData) {
    return this.updateNow<T>(collection, id, data);
  }

  async delete(collection: string, id: string) {
    this.exec(
      'DELETE FROM docs WHERE collection = ? AND id = ?',
      collection,
      id,
    );
  }

  // All the changes, or none of them.
  async batch(writes: Write[]) {
    this.storage.transactionSync(() => {
      for (const write of writes) {
        if (write.op === 'delete') {
          this.exec(
            'DELETE FROM docs WHERE collection = ? AND id = ?',
            write.collection,
            write.id,
          );
        } else {
          this.updateNow(write.collection, write.id, write.data);
        }
      }
    });
  }

  async addToSet<T extends Doc>(
    collection: string,
    id: string,
    field: string,
    value: string,
  ) {
    return this.changeSet<T>(collection, id, field, items =>
      items.includes(value) ? items : [...items, value].sort(),
    );
  }

  async removeFromSet<T extends Doc>(
    collection: string,
    id: string,
    field: string,
    value: string,
  ) {
    return this.changeSet<T>(collection, id, field, items =>
      items.filter(item => item !== value),
    );
  }

  async increment<T extends Doc>(
    collection: string,
    id: string,
    amounts: Record<string, number>,
  ) {
    return this.transaction(() => {
      const existing = this.read<T>(collection, id);
      const data = structuredClone((existing ?? {}) as unknown as DocData);
      for (const [path, amount] of Object.entries(amounts)) {
        const names = path.split('.');
        let target = data;
        for (const name of names.slice(0, -1)) {
          const next = target[name];
          target[name] = typeof next === 'object' && next !== null ? next : {};
          target = target[name] as DocData;
        }
        const last = names[names.length - 1];
        const current = target[last];
        target[last] = (typeof current === 'number' ? current : 0) + amount;
      }
      const now = new Date();
      return this.write<T>(
        collection,
        id,
        data,
        existing?.createdAt ?? now,
        now,
      );
    });
  }

  async createUnique<T extends Doc>(
    collection: string,
    data: DocData,
    unique: string[][],
  ) {
    return this.transaction(() => {
      for (const fields of unique) {
        const conditions = fields.map(field => `${fieldSql(field)} = ?`);
        const [taken] = this.rows(
          `SELECT id FROM docs WHERE collection = ? AND ${conditions.join(' AND ')} LIMIT 1`,
          collection,
          ...fields.map(field => sqlValue(data[field])),
        );
        if (taken) return undefined;
      }
      const now = new Date();
      return this.write<T>(collection, randomUUID(), data, now, now);
    });
  }

  async clear() {
    this.exec('DELETE FROM docs');
  }

  // Keeps a document as it was, dates included (for copying data in).
  importDoc(collection: string, doc: Doc) {
    const {id, createdAt, updatedAt, ...data} = doc as Doc & DocData;
    this.write(collection, id, data, createdAt, updatedAt);
  }

  getMeta(key: string) {
    const [row] = this.rows('SELECT value FROM meta WHERE key = ?', key);
    return row ? String(row.value) : undefined;
  }

  setMeta(key: string, value: string) {
    this.exec(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key,
      value,
    );
  }

  transaction<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }

  // Like Firestore, a write that changes nothing keeps the old updatedAt.
  private updateNow<T extends Doc>(
    collection: string,
    id: string,
    data: DocData,
  ) {
    const existing = this.read<T>(collection, id);
    if (!existing) return undefined;

    const changed = Object.keys(data).some(
      field =>
        JSON.stringify(encode(data[field])) !==
        JSON.stringify(encode((existing as unknown as DocData)[field])),
    );
    if (!changed) return existing;

    const {
      id: _id,
      createdAt,
      updatedAt: _updatedAt,
      ...fields
    } = {...existing, ...data} as Doc & DocData;
    void _id;
    void _updatedAt;
    return this.write<T>(collection, id, fields, createdAt, new Date());
  }

  private changeSet<T extends Doc>(
    collection: string,
    id: string,
    field: string,
    change: (items: string[]) => string[],
  ) {
    return this.transaction(() => {
      const existing = this.read<T>(collection, id);
      if (!existing) return undefined;
      const items = (existing as unknown as DocData)[field];
      return this.updateNow<T>(collection, id, {
        [field]: change(Array.isArray(items) ? items : []),
      });
    });
  }

  private read<T extends Doc>(collection: string, id: string) {
    const [row] = this.rows(
      'SELECT * FROM docs WHERE collection = ? AND id = ?',
      collection,
      id,
    );
    return row ? this.toDoc<T>(row) : undefined;
  }

  private write<T extends Doc>(
    collection: string,
    id: string,
    data: DocData,
    createdAt: Date,
    updatedAt: Date,
  ) {
    const {id: _id, createdAt: _c, updatedAt: _u, ...fields} = data;
    void _id;
    void _c;
    void _u;
    this.exec(
      `INSERT INTO docs (collection, id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at, updated_at = excluded.updated_at`,
      collection,
      id,
      JSON.stringify(encode(fields) ?? {}),
      createdAt.getTime(),
      updatedAt.getTime(),
    );
    return {...fields, id, createdAt, updatedAt} as unknown as T;
  }

  private condition(where: Where) {
    if (where.op === 'array-contains') {
      return `EXISTS (SELECT 1 FROM json_each(data, '$.${fieldName(where.field)}') WHERE value = ?)`;
    }
    return `${fieldSql(where.field)} = ?`;
  }

  private toDoc<T extends Doc>(row: Record<string, unknown>): T {
    const {id, data, created_at, updated_at} = row as unknown as Row;
    return {
      ...(decode(JSON.parse(data) as Json) as DocData),
      id,
      createdAt: new Date(created_at),
      updatedAt: new Date(updated_at),
    } as unknown as T;
  }

  private rows(query: string, ...bindings: SqlValue[]) {
    return this.storage.sql.exec(query, ...bindings).toArray();
  }

  private exec(query: string, ...bindings: SqlValue[]) {
    this.rows(query, ...bindings);
  }
}

export {SqlDocumentStore, SqlStorage, SqlValue};
