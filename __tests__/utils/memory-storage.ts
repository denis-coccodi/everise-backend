import {deserialize, serialize} from 'node:v8';
import {KeyValueStorage} from '../../src/db';

// In-memory stand-in for Durable Object storage. Values are cloned on the way
// in and out (keeping Dates intact) to mimic real persistence.
const clone = <T>(value: T): T => deserialize(serialize(value));

class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string) {
    const value = this.data.get(key) as T | undefined;
    return value === undefined ? undefined : clone(value);
  }

  async put<T>(key: string, value: T) {
    this.data.set(key, clone(value));
  }

  async delete(key: string) {
    return this.data.delete(key);
  }

  async list<T>(options: {prefix: string}) {
    const result = new Map<string, T>();
    for (const key of [...this.data.keys()].sort()) {
      if (key.startsWith(options.prefix)) {
        result.set(key, clone(this.data.get(key) as T));
      }
    }
    return result;
  }

  async deleteAll() {
    this.data.clear();
  }
}

export {MemoryStorage};
