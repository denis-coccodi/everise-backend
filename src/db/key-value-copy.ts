import {Doc} from './db';
import {isDate} from './json-values';
import {SqlDocumentStore} from './sql-document-store';

// The key-value storage the database used before its SQL table: documents
// under "<collection>/<id>".
interface KeyValueList {
  list<T>(options: {
    startAfter?: string;
    limit: number;
  }): Promise<Map<string, T>>;
}

const COPIED = 'key-value-copied';
const PAGE = 100;

// Copies every document from the old key-value storage into the SQL table,
// once (recorded in `meta`). The key-value data is left as it was, as a
// backup. A copy cut short runs again from the start the next time.
async function copyKeyValueDocuments(
  keyValue: KeyValueList,
  store: SqlDocumentStore,
) {
  if (store.getMeta(COPIED)) return 0;

  let copied = 0;
  let startAfter: string | undefined;
  for (;;) {
    const page = await keyValue.list<Doc>({startAfter, limit: PAGE});
    if (page.size === 0) break;
    store.transaction(() => {
      for (const [key, doc] of page) {
        const slash = key.indexOf('/');
        if (slash < 0 || typeof doc !== 'object' || doc === null) continue;
        const date = (value: unknown) =>
          typeof value === 'object' && value !== null && isDate(value)
            ? new Date(value.getTime())
            : new Date(0);
        store.importDoc(key.slice(0, slash), {
          ...doc,
          id: key.slice(slash + 1),
          createdAt: date(doc.createdAt),
          updatedAt: date(doc.updatedAt),
        });
        copied++;
      }
    });
    startAfter = [...page.keys()].pop();
  }
  store.setMeta(COPIED, `${copied} documents, ${new Date().toISOString()}`);
  return copied;
}

export {KeyValueList, copyKeyValueDocuments};
