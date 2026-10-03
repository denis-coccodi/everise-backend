import {randomUUID} from 'crypto';
import {Db, Doc, DocData, FindOptions, Where} from './db';

// The subset of the Durable Object storage API the store relies on.
interface KeyValueStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: {prefix: string}): Promise<Map<string, T>>;
  deleteAll(): Promise<void>;
}

// Documents are stored under "<collection>/<id>". Queries scan the collection,
// which is fine for a small app but would need secondary indexes at scale.
class DocumentStore implements Db {
  constructor(private readonly storage: KeyValueStorage) {}

  async get<T extends Doc>(collection: string, id: string) {
    return this.storage.get<T>(this.key(collection, id));
  }

  async find<T extends Doc>(collection: string, options: FindOptions = {}) {
    const docs = await this.storage.list<T>({prefix: `${collection}/`});

    let results = [...docs.values()].filter(doc =>
      (options.where ?? []).every(where => this.matches(doc, where))
    );

    const orderBy = options.orderBy ?? [];
    results.sort((a, b) => {
      for (const {field, direction} of orderBy) {
        const sign = direction === 'asc' ? 1 : -1;
        const x = (a as unknown as DocData)[field] as number | string | Date;
        const y = (b as unknown as DocData)[field] as number | string | Date;
        if (x < y) return -sign;
        if (x > y) return sign;
      }
      return 0;
    });

    const offset = options.offset ?? 0;
    results = results.slice(
      offset,
      options.limit !== undefined ? offset + options.limit : undefined
    );

    return results;
  }

  async create<T extends Doc>(collection: string, data: DocData) {
    const now = new Date();

    const doc = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    } as unknown as T;

    await this.storage.put(this.key(collection, doc.id), doc);

    return doc;
  }

  async update<T extends Doc>(collection: string, id: string, data: DocData) {
    const existing = await this.get<T>(collection, id);

    if (!existing) {
      return undefined;
    }

    // Like Firestore, a write that changes nothing keeps the old updatedAt.
    const changed = Object.keys(data).some(
      field =>
        JSON.stringify(data[field]) !==
        JSON.stringify((existing as unknown as DocData)[field])
    );

    if (!changed) {
      return existing;
    }

    const doc = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    } as T;

    await this.storage.put(this.key(collection, id), doc);

    return doc;
  }

  async delete(collection: string, id: string) {
    await this.storage.delete(this.key(collection, id));
  }

  async clear() {
    await this.storage.deleteAll();
  }

  // Every stored entry (documents and internal markers), for copying a whole
  // database into another store.
  async exportAll() {
    return [...(await this.storage.list<unknown>({prefix: ''})).entries()];
  }

  // Copies the entries returned by `source` (another store's exportAll) into
  // this store, once. A store that already holds documents is never
  // overwritten. If a previous copy was interrupted, it is redone. The caller
  // must keep other requests out while this runs (blockConcurrencyWhile).
  // Returns how many entries were copied.
  async importOnce(marker: string, source: () => Promise<[string, unknown][]>) {
    const key = this.markerKey(marker);
    const state = await this.storage.get<{status: string}>(key);

    if (state?.status === 'done') return 0;

    if (!state && (await this.storage.list({prefix: ''})).size > 0) {
      await this.storage.put(key, {status: 'done', at: new Date(), copied: 0});
      return 0;
    }

    await this.storage.put(key, {status: 'copying', at: new Date()});

    const entries = await source();
    for (const [entryKey, value] of entries) {
      await this.storage.put(entryKey, value);
    }

    await this.storage.put(key, {
      status: 'done',
      at: new Date(),
      copied: entries.length,
    });

    return entries.length;
  }

  // Internal markers live outside any collection's "<collection>/" prefix.
  private markerKey(marker: string) {
    return `_meta:${marker}`;
  }

  private key(collection: string, id: string) {
    return `${collection}/${id}`;
  }

  private matches(doc: Doc, where: Where) {
    const value = (doc as unknown as DocData)[where.field];

    if (where.op === 'array-contains') {
      return Array.isArray(value) && value.includes(where.value);
    }

    return value === where.value;
  }
}

export {DocumentStore, KeyValueStorage};
