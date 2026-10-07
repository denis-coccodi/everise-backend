import {deserialize, serialize} from 'node:v8';
import {KeyValueList} from '../../src/db';

// In-memory stand-in for the Durable Object key-value storage the database
// used before its SQL table. Values are cloned (keeping Dates and bytes), and
// listed in key order, a page at a time, as the real storage does.
const clone = <T>(value: T): T => deserialize(serialize(value));

class MemoryStorage implements KeyValueList {
  private readonly data = new Map<string, unknown>();

  put(key: string, value: unknown) {
    this.data.set(key, clone(value));
  }

  async list<T>(options: {startAfter?: string; limit: number}) {
    const keys = [...this.data.keys()]
      .sort()
      .filter(
        key => options.startAfter === undefined || key > options.startAfter,
      )
      .slice(0, options.limit);
    return new Map(keys.map(key => [key, clone(this.data.get(key) as T)]));
  }
}

export {MemoryStorage};
