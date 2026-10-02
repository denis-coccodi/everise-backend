import {DurableObject} from 'cloudflare:workers';
import type {DurableObjectNamespace} from 'cloudflare:workers';
import {Db, DocData, FindOptions} from './db';
import {DocumentStore} from './document-store';

// A single Durable Object instance holds the whole database. Its storage is
// strongly consistent and requests to it are serialized, so read-then-write
// sequences (e.g. "is this username taken?") don't race each other.
class ConduitDb extends DurableObject {
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

  update(collection: string, id: string, data: DocData) {
    return this.store.update(collection, id, data);
  }

  delete(collection: string, id: string) {
    return this.store.delete(collection, id);
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
    private readonly name = 'conduit'
  ) {}

  private get stub() {
    return this.namespace.getByName(this.name);
  }

  get: Db['get'] = (collection, id) => this.stub.get(collection, id);

  find: Db['find'] = (collection, options) =>
    this.stub.find(collection, options);

  create: Db['create'] = (collection, data) =>
    this.stub.create(collection, data);

  update: Db['update'] = (collection, id, data) =>
    this.stub.update(collection, id, data);

  delete: Db['delete'] = (collection, id) => this.stub.delete(collection, id);

  clear: Db['clear'] = () => this.stub.clear();
}

export {ConduitDb, DurableObjectDb};
