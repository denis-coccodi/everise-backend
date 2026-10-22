// Every stored document gets these fields from the store itself.
interface Doc {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

type DocData = Record<string, unknown>;

interface FindOptions {
  where?: Where[];
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];
  limit?: number;
  offset?: number;
}

interface SetOptions {
  max?: number;
  create?: boolean;
}

interface Where {
  field: string;
  op: '==' | 'array-contains';
  value: unknown;
}

// One change in a batch.
type Write =
  | {op: 'delete'; collection: string; id: string}
  | {op: 'update'; collection: string; id: string; data: DocData};

type Json = null | boolean | number | string | Json[] | {[key: string]: Json};

type SqlValue = string | number | null;

export {Doc, DocData, FindOptions, Json, SetOptions, SqlValue, Where, Write};
