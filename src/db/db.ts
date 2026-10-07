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

// A minimal NoSQL document store. Implemented by `DocumentStore`, which runs
// inside the `EveriseDb` Durable Object in production and in memory in tests.
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
  clear(): Promise<void>;
}

export {Db, Doc, DocData, FindOptions, Where, Write};
