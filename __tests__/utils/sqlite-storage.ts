import {DatabaseSync} from 'node:sqlite';
import {SqlStorage} from '../../src/db';

// An in-memory SQLite database with the Durable Object SQL storage API, so
// tests run the same SQL as production.
class SqliteStorage implements SqlStorage {
  private readonly db = new DatabaseSync(':memory:');

  readonly sql = {
    exec: (query: string, ...bindings: (string | number | null)[]) => {
      const rows = this.db.prepare(query).all(...bindings) as Record<
        string,
        unknown
      >[];
      return {toArray: () => rows};
    },
  };

  transactionSync<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

export {SqliteStorage};
