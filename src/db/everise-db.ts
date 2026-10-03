import {DurableObject} from 'cloudflare:workers';
import type {DurableObjectNamespace} from 'cloudflare:workers';
import {Db, DocData, FindOptions} from './db';
import {DocumentStore} from './document-store';

// The Durable Object instance that holds the whole database.
const DB_NAME = 'everise';

// Until October 2026 the data lived in an instance named "conduit". The first
// time the "everise" instance is used, it copies everything from there once
// (see EveriseDb.ready). The old instance is left untouched as a backup.
// Remove this, exportAll and the copy logic once every environment has been
// deployed with this code and its data checked.
const LEGACY_DB_NAME = 'conduit';
const LEGACY_COPY_MARKER = `copied-from-${LEGACY_DB_NAME}`;

// What other code can call on an EveriseDb instance (over RPC).
type EveriseDbStub = Db & {exportAll(): Promise<[string, unknown][]>};

interface Env {
  DB: DurableObjectNamespace<EveriseDbStub>;
}

// A single Durable Object instance holds the whole database. Its storage is
// strongly consistent and requests to it are serialized, so read-then-write
// sequences (e.g. "is this username taken?") don't race each other.
class EveriseDb extends DurableObject<Env> {
  private readonly store = new DocumentStore(this.ctx.storage);
  private copyFromLegacy?: Promise<number>;

  // Runs before the first database call: copies the legacy instance's data
  // into this one if that has not happened yet. blockConcurrencyWhile keeps
  // every other request waiting until the copy is complete.
  private ready() {
    this.copyFromLegacy ??= this.ctx.blockConcurrencyWhile(() =>
      this.store.importOnce(LEGACY_COPY_MARKER, () =>
        this.env.DB.getByName(LEGACY_DB_NAME).exportAll()
      )
    );
    return this.copyFromLegacy;
  }

  async get(collection: string, id: string) {
    await this.ready();
    return this.store.get(collection, id);
  }

  async find(collection: string, options?: FindOptions) {
    await this.ready();
    return this.store.find(collection, options);
  }

  async create(collection: string, data: DocData) {
    await this.ready();
    return this.store.create(collection, data);
  }

  async update(collection: string, id: string, data: DocData) {
    await this.ready();
    return this.store.update(collection, id, data);
  }

  async delete(collection: string, id: string) {
    await this.ready();
    return this.store.delete(collection, id);
  }

  async clear() {
    await this.ready();
    return this.store.clear();
  }

  // Called on the legacy instance only: everything it stores. It must not call
  // ready(), or the legacy instance would try to copy from itself.
  exportAll() {
    return this.store.exportAll();
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

  update: Db['update'] = (collection, id, data) =>
    this.stub.update(collection, id, data);

  delete: Db['delete'] = (collection, id) => this.stub.delete(collection, id);

  clear: Db['clear'] = () => this.stub.clear();
}

export {EveriseDb, DurableObjectDb};
