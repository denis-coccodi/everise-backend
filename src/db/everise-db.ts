import {DurableObject} from 'cloudflare:workers';
import type {DurableObjectNamespace} from 'cloudflare:workers';
import {Db, DocData, FindOptions, Write} from './db';
import {DocumentStore} from './document-store';

// The Durable Object instance that holds the whole database. The name selects
// the storage: a different name is a different, empty database.
const DB_NAME = 'everise';

// A single Durable Object instance holds the whole database. Its storage is
// strongly consistent and requests to it are serialized, so read-then-write
// sequences (e.g. "is this username taken?") don't race each other.
class EveriseDb extends DurableObject {
  private readonly store = new DocumentStore(this.ctx.storage);

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

  clear() {
    return this.store.clear();
  }
}

// Worker-side client. A Durable Object stub can't be reused across requests,
// so a fresh one is created per call (this is cheap).
class DurableObjectDb implements Db {
  constructor(
    private readonly namespace: DurableObjectNamespace<Db>,
    private readonly name = DB_NAME
  ) {}

  private get stub() {
    return this.namespace.getByName(this.name);
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

  clear: Db['clear'] = () => this.stub.clear();
}

export {EveriseDb, DurableObjectDb};
