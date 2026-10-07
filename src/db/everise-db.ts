import {DurableObject} from 'cloudflare:workers';
import {Db, DocData, FindOptions, SetOptions, Write} from './db';
import {copyKeyValueDocuments} from './key-value-copy';
import {SqlDocumentStore} from './sql-document-store';

// The Durable Object instance that holds the whole database. The name selects
// the storage: a different name is a different, empty database.
const DB_NAME = 'everise';

// A single Durable Object instance holds the whole database, in its SQLite
// storage (SqlDocumentStore). Each call runs on its own, but two calls from
// one request can have another request's calls between them.
class EveriseDb extends DurableObject {
  private readonly store: SqlDocumentStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new SqlDocumentStore(ctx.storage);
    // Before the first request: the data from before the SQL table.
    void ctx.blockConcurrencyWhile(async () => {
      const copied = await copyKeyValueDocuments(ctx.storage, this.store);
      if (copied > 0) {
        console.log(`Copied ${copied} documents from key-value storage.`);
      }
    });
  }

  get(collection: string, id: string) {
    return this.store.get(collection, id);
  }

  find(collection: string, options?: FindOptions) {
    return this.store.find(collection, options);
  }

  create(collection: string, data: DocData) {
    return this.store.create(collection, data);
  }

  set(collection: string, id: string, data: DocData) {
    return this.store.set(collection, id, data);
  }

  update(collection: string, id: string, data: DocData) {
    return this.store.update(collection, id, data);
  }

  delete(collection: string, id: string) {
    return this.store.delete(collection, id);
  }

  batch(writes: Write[]) {
    return this.store.batch(writes);
  }

  addToSet(
    collection: string,
    id: string,
    field: string,
    value: string,
    options?: SetOptions,
  ) {
    return this.store.addToSet(collection, id, field, value, options);
  }

  takeLease(
    collection: string,
    id: string,
    field: string,
    now: number,
    until: number,
  ) {
    return this.store.takeLease(collection, id, field, now, until);
  }

  removeFromSet(collection: string, id: string, field: string, value: string) {
    return this.store.removeFromSet(collection, id, field, value);
  }

  increment(collection: string, id: string, amounts: Record<string, number>) {
    return this.store.increment(collection, id, amounts);
  }

  createUnique(collection: string, data: DocData, unique: string[][]) {
    return this.store.createUnique(collection, data, unique);
  }

  clear() {
    return this.store.clear();
  }
}

// Worker-side client. A Durable Object stub can't be reused across requests,
// so a fresh one is created per call (this is cheap).
class DurableObjectDb implements Db {
  constructor(
    private readonly namespace: DurableObjectNamespace<EveriseDb>,
    private readonly name = DB_NAME,
  ) {}

  // The RPC stub's types wrap every result (for promise pipelining) and drop
  // the store's generics; the values are copies of the same documents.
  private get stub(): Db {
    return this.namespace.getByName(this.name) as unknown as Db;
  }

  get: Db['get'] = (collection, id) => this.stub.get(collection, id);

  find: Db['find'] = (collection, options) =>
    this.stub.find(collection, options);

  create: Db['create'] = (collection, data) =>
    this.stub.create(collection, data);

  set: Db['set'] = (collection, id, data) =>
    this.stub.set(collection, id, data);

  update: Db['update'] = (collection, id, data) =>
    this.stub.update(collection, id, data);

  delete: Db['delete'] = (collection, id) => this.stub.delete(collection, id);

  batch: Db['batch'] = writes => this.stub.batch(writes);

  addToSet: Db['addToSet'] = (collection, id, field, value, options) =>
    this.stub.addToSet(collection, id, field, value, options);

  takeLease: Db['takeLease'] = (collection, id, field, now, until) =>
    this.stub.takeLease(collection, id, field, now, until);

  removeFromSet: Db['removeFromSet'] = (collection, id, field, value) =>
    this.stub.removeFromSet(collection, id, field, value);

  increment: Db['increment'] = (collection, id, amounts) =>
    this.stub.increment(collection, id, amounts);

  createUnique: Db['createUnique'] = (collection, data, unique) =>
    this.stub.createUnique(collection, data, unique);

  clear: Db['clear'] = () => this.stub.clear();
}

export {EveriseDb, DurableObjectDb};
