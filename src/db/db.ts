// Every stored document gets these fields from the store itself.
interface Doc {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

type DocData = Record<string, unknown>;

interface Where {
  field: string;
  op: '==' | 'array-contains';
  value: unknown;
}

interface FindOptions {
  where?: Where[];
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
  offset?: number;
}

// One change in a batch.
type Write =
  | {op: 'delete'; collection: string; id: string}
  | {op: 'update'; collection: string; id: string; data: DocData};

// A minimal document store. Implemented by `SqlDocumentStore`, which runs
// inside the `EveriseDb` Durable Object, and on in-memory SQLite in tests.
interface Db {
  get<T extends Doc>(collection: string, id: string): Promise<T | undefined>;
  find<T extends Doc>(collection: string, options?: FindOptions): Promise<T[]>;
  create<T extends Doc>(collection: string, data: DocData): Promise<T>;
  // Creates or replaces the document with the given id.
  set<T extends Doc>(collection: string, id: string, data: DocData): Promise<T>;
  update<T extends Doc>(
    collection: string,
    id: string,
    data: DocData,
  ): Promise<T | undefined>;
  delete(collection: string, id: string): Promise<void>;
  // Applies many changes in one call to the database, e.g. everything a
  // deleted member leaves behind. A Worker on the free plan may only make 50
  // calls per request, so a long loop of single writes could be cut short.
  batch(writes: Write[]): Promise<void>;

  // Each of these reads and writes in one call to the database, so no other
  // request's write can come between (a separate get and update can).

  // Adds `value` at the end of the array `field` unless it's there, or the
  // array already has `max` items. The document after, or undefined when
  // there's none (unless `create`, which makes it).
  addToSet<T extends Doc>(
    collection: string,
    id: string,
    field: string,
    value: string,
    options?: SetOptions,
  ): Promise<T | undefined>;
  removeFromSet<T extends Doc>(
    collection: string,
    id: string,
    field: string,
    value: string,
  ): Promise<T | undefined>;
  // A lease: sets the number `field` to `until` when it's missing or at
  // most `now` (nobody holds it), creating the document if there's none.
  // True when this call took it.
  takeLease(
    collection: string,
    id: string,
    field: string,
    now: number,
    until: number,
  ): Promise<boolean>;
  // Adds the amounts to number fields (missing ones count as 0; a dotted
  // name such as `members.<id>` reaches into an object), creating the
  // document under `id` if there's none.
  increment<T extends Doc>(
    collection: string,
    id: string,
    amounts: Record<string, number>,
  ): Promise<T>;
  // Creates the document unless one already matches every field of one of
  // the `unique` groups (e.g. [['email'], ['username']]); undefined then.
  createUnique<T extends Doc>(
    collection: string,
    data: DocData,
    unique: string[][],
  ): Promise<T | undefined>;
  clear(): Promise<void>;
}

interface SetOptions {
  max?: number;
  create?: boolean;
}

export {Db, Doc, DocData, FindOptions, SetOptions, Where, Write};
