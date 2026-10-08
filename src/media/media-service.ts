import {StatusCodes} from 'http-status-codes';
import {randomUUID} from 'crypto';
import {config} from '../config';
import {Db, Doc} from '../db';
import {InvalidImageError, TooManyRequestsError} from '../errors';
import {FileStore, StoredFile, UploadStorage} from '../files';
import {ImageType, readImageInfo} from '../users/image-info';

// Images and GIFs people upload for their posts and comments: the bytes in
// the file store (R2), a document each with the rest. The site shrinks large
// pictures to fit before uploading; GIFs keep their animation, so they must
// already be small enough.
const MAX_MEDIA_KB = 1024;
const MAX_MEDIA_BYTES = MAX_MEDIA_KB * 1024;
const MAX_MEDIA_SIDE = 4096;
// Uploads per person per day, and all they may keep, so nobody fills the
// free plan's storage (R2: 10 GB).
const DAILY_UPLOADS = 30;
const MEMBER_STORAGE_MB = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

interface MediaDoc extends Doc {
  userId: string;
  contentType: ImageType;
  width: number;
  height: number;
  // Its bytes; unset on uploads from before the file store: those have
  // `data`, moved to the file store the first time they're read.
  size?: number;
  data?: Uint8Array;
  // When it was uploaded (ms), by the app's clock, for the daily limit.
  uploadedAt: number;
  // False until a post or comment uses it; a day later, an upload still
  // unused is deleted. Unset on uploads from before attachments, which old
  // posts use from their text: those are never swept.
  attached?: boolean;
}

interface StoredMedia {
  id: string;
  url: string;
  contentType: ImageType;
  width: number;
  height: number;
}

class MediaService {
  private readonly collection = 'media';

  constructor(
    private readonly db: Db,
    private readonly files: FileStore,
    private readonly storage: UploadStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Checks an upload and stores it; returns where it's served.
  async save(userId: string, data: Uint8Array): Promise<StoredMedia> {
    if (data.byteLength > MAX_MEDIA_BYTES) {
      throw tooLarge();
    }
    const info = readImageInfo(data);
    if (!info) {
      throw new InvalidImageError('Choose a PNG, JPEG, WebP or GIF image.');
    }
    if (info.width > MAX_MEDIA_SIDE || info.height > MAX_MEDIA_SIDE) {
      throw new InvalidImageError(
        `The image is ${info.width} × ${info.height} pixels; it can be at most ${MAX_MEDIA_SIDE} × ${MAX_MEDIA_SIDE}.`,
      );
    }
    await this.sweepUnused(userId);
    const uploads = await this.uploadsOf(userId);
    this.checkDailyLimit(uploads);
    this.checkStorage(uploads, data.byteLength);
    await this.storage.reserve(data.byteLength);

    // The file first: a document never names a file that isn't there.
    const id = randomUUID();
    try {
      await this.files.put(fileKey(id), data, info.type);
      await this.db.set(this.collection, id, {
        userId,
        contentType: info.type,
        width: info.width,
        height: info.height,
        size: data.byteLength,
        uploadedAt: this.now().getTime(),
        attached: false,
      });
    } catch (err) {
      await this.storage.release(data.byteLength);
      throw err;
    }
    return {
      id,
      url: mediaUrl(id),
      contentType: info.type,
      width: info.width,
      height: info.height,
    };
  }

  async get(id: string) {
    const doc = await this.db.get<MediaDoc>(this.collection, id);
    if (!doc) return undefined;
    if (doc.data) {
      await this.files.put(fileKey(id), doc.data, doc.contentType);
      await this.storage.count(doc.data.byteLength);
      await this.db.update(this.collection, id, {
        data: undefined,
        size: doc.data.byteLength,
      });
      return {contentType: doc.contentType, data: doc.data};
    }
    const data = await this.files.get(fileKey(id));
    return data && {contentType: doc.contentType, data};
  }

  // Everything a person uploaded, e.g. to delete with their account
  // (deleteFiles, then the documents).
  async filesOf(userId: string): Promise<StoredFile[]> {
    return (await this.uploadsOf(userId)).map(storedFile);
  }

  async deleteFiles(stored: StoredFile[]) {
    await this.files.delete(stored.map(file => fileKey(file.id)));
    await this.storage.release(
      stored.reduce((total, file) => total + file.size, 0),
    );
  }

  // Marks a person's uploads as used by a post or comment.
  async claim(userId: string, ids: string[]) {
    await this.db.batch(
      (await this.ownedOf(userId, ids)).map(doc => ({
        op: 'update',
        collection: this.collection,
        id: doc.id,
        data: {attached: true},
      })),
    );
  }

  // Deletes a person's uploads that a deleted post or comment (or a removed
  // attachment) used. Someone else's upload is left alone.
  async release(userId: string, ids: string[]) {
    await this.remove(await this.ownedOf(userId, ids));
  }

  private async ownedOf(userId: string, ids: string[]) {
    const docs = await Promise.all(
      [...new Set(ids)].map(id => this.db.get<MediaDoc>(this.collection, id)),
    );
    return docs.filter(
      (doc): doc is MediaDoc => !!doc && doc.userId === userId,
    );
  }

  // The files first: if deleting the documents fails, they're still there
  // to try again.
  private async remove(docs: MediaDoc[]) {
    if (docs.length === 0) return;
    await this.deleteFiles(docs.map(storedFile));
    await this.db.batch(
      docs.map(doc => ({
        op: 'delete',
        collection: this.collection,
        id: doc.id,
      })),
    );
  }

  // Uploads added to a post or comment that was never sent: deleted once
  // they're a day old, the next time that person uploads.
  private async sweepUnused(userId: string) {
    const before = this.now().getTime() - DAY_MS;
    await this.remove(
      (await this.uploadsOf(userId)).filter(
        doc => doc.attached === false && doc.uploadedAt < before,
      ),
    );
  }

  private checkDailyLimit(uploads: MediaDoc[]) {
    const since = this.now().getTime() - DAY_MS;
    const recent = uploads.filter(doc => doc.uploadedAt > since);
    if (recent.length >= DAILY_UPLOADS) {
      // Free again when the oldest of today's uploads is a day old.
      const oldest = Math.min(...recent.map(doc => doc.uploadedAt));
      throw new TooManyRequestsError(
        `You can upload ${DAILY_UPLOADS} images a day. Try again later, or link to an image instead.`,
        Math.max(1, Math.ceil((oldest - since) / 1000)),
      );
    }
  }

  private checkStorage(uploads: MediaDoc[], adding: number) {
    const used = uploads.reduce(
      (total, doc) => total + (doc.size ?? doc.data?.byteLength ?? 0),
      0,
    );
    if (used + adding > MEMBER_STORAGE_MB * 1024 * 1024) {
      throw new InvalidImageError(
        `Your uploads fill your ${MEMBER_STORAGE_MB} MB. Delete posts or comments with images you no longer need, or link to an image instead.`,
      );
    }
  }

  private uploadsOf(userId: string) {
    return this.db.find<MediaDoc>(this.collection, {
      where: [{field: 'userId', op: '==', value: userId}],
    });
  }
}

// An upload and its bytes in the file store (none while they're still in
// its document: those were never counted in).
function storedFile(doc: MediaDoc): StoredFile {
  return {id: doc.id, size: doc.data ? 0 : (doc.size ?? 0)};
}

// Where an upload's bytes are in the file store.
const fileKey = (id: string) => `media/${id}`;

// Where an upload is served; the site's own address, through its /api.
function mediaUrl(id: string) {
  return `${config.baseUrl}/api/media/${id}`;
}

function tooLarge() {
  return new InvalidImageError(
    'The image is too large: it can be at most 1 MB.',
    StatusCodes.REQUEST_TOO_LONG,
  );
}

export {
  MAX_MEDIA_BYTES,
  MEMBER_STORAGE_MB,
  MediaService,
  StoredMedia,
  tooLarge,
};
