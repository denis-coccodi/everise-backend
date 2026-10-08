import {Db, Doc} from '../db';
import {StorageFullError} from '../errors';

interface StorageDoc extends Doc {
  bytes?: number;
}

// A file in the file store and its bytes, e.g. to delete with an account.
interface StoredFile {
  id: string;
  size: number;
}

const COLLECTION = 'siteStorage';
const UPLOADS = 'uploads';

// The bytes everyone's uploads (post images, GIFs, profile pictures) keep in
// the file store, against one limit for the whole site: R2's free 10 GB are
// shared by staging and production, so the two limits together stay under
// them. Each member's own limits still apply first.
class UploadStorage {
  constructor(
    private readonly db: Db,
    private readonly limitBytes: number,
  ) {}

  // Counts an upload in before its file is stored; refused, and counted out
  // again, when it would go past the limit. One step each way, so uploads
  // at the same time can't both squeeze in.
  async reserve(bytes: number) {
    const doc = await this.add(bytes);
    if ((doc.bytes ?? 0) > this.limitBytes) {
      await this.add(-bytes);
      throw new StorageFullError(
        "The site's storage for images is full for now. Link to an image instead, or try again later.",
      );
    }
  }

  // Counts in a file already stored (e.g. one moved into the file store).
  async count(bytes: number) {
    if (bytes > 0) await this.add(bytes);
  }

  // Counts out deleted files.
  async release(bytes: number) {
    if (bytes > 0) await this.add(-bytes);
  }

  async used() {
    return (await this.db.get<StorageDoc>(COLLECTION, UPLOADS))?.bytes ?? 0;
  }

  private add(bytes: number) {
    return this.db.increment<StorageDoc>(COLLECTION, UPLOADS, {bytes});
  }
}

export {StoredFile, UploadStorage};
