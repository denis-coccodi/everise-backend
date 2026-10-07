// Where uploaded images' bytes live: an R2 bucket in the Worker (the IMAGES
// binding), memory in tests and wherever no bucket is given. The database
// keeps a document per image (owner, type, size) that names its key.
interface FileStore {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  // Deleting a key that isn't there is fine.
  delete(keys: string[]): Promise<void>;
}

// The subset of the R2 bucket API the store relies on.
interface R2Bucket {
  put(
    key: string,
    value: Uint8Array,
    options: {httpMetadata: {contentType: string}},
  ): Promise<unknown>;
  get(key: string): Promise<{arrayBuffer(): Promise<ArrayBuffer>} | null>;
  delete(keys: string[]): Promise<void>;
}

// R2 deletes at most this many keys in one call.
const DELETE_BATCH = 1000;

class R2FileStore implements FileStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, data: Uint8Array, contentType: string) {
    await this.bucket.put(key, data, {httpMetadata: {contentType}});
  }

  async get(key: string) {
    const object = await this.bucket.get(key);
    return object ? new Uint8Array(await object.arrayBuffer()) : undefined;
  }

  async delete(keys: string[]) {
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      await this.bucket.delete(keys.slice(start, start + DELETE_BATCH));
    }
  }
}

class MemoryFileStore implements FileStore {
  readonly files = new Map<string, Uint8Array>();

  async put(key: string, data: Uint8Array) {
    this.files.set(key, new Uint8Array(data));
  }

  async get(key: string) {
    return this.files.get(key);
  }

  async delete(keys: string[]) {
    for (const key of keys) this.files.delete(key);
  }
}

export {FileStore, MemoryFileStore, R2Bucket, R2FileStore};
