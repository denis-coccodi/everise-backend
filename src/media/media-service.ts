import {randomUUID} from 'crypto';
import {config} from '../config';
import {Db, Doc} from '../db';
import {Write} from '../db/db';
import {InvalidImageError, TooManyRequestsError} from '../errors';
import {ImageType, readImageInfo} from '../users/image-info';

// Images and GIFs people upload for their posts and comments, one document
// each with the bytes. The site shrinks large pictures to fit before
// uploading; GIFs keep their animation, so they must already be small enough.
const MAX_MEDIA_KB = 1024;
const MAX_MEDIA_BYTES = MAX_MEDIA_KB * 1024;
const MAX_MEDIA_SIDE = 4096;
// Uploads per person per day, so nobody fills the free plan's storage.
const DAILY_UPLOADS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface MediaDoc extends Doc {
  userId: string;
  contentType: ImageType;
  width: number;
  height: number;
  data: Uint8Array;
  // When it was uploaded (ms), by the app's clock, for the daily limit.
  uploadedAt: number;
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
    private readonly now: () => Date = () => new Date()
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
        `The image is ${info.width} × ${info.height} pixels; it can be at most ${MAX_MEDIA_SIDE} × ${MAX_MEDIA_SIDE}.`
      );
    }
    await this.checkDailyLimit(userId);

    const id = randomUUID();
    await this.db.set(this.collection, id, {
      userId,
      contentType: info.type,
      width: info.width,
      height: info.height,
      data,
      uploadedAt: this.now().getTime(),
    });
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
    return doc && {contentType: doc.contentType, data: doc.data};
  }

  // The writes that delete everything a person uploaded, e.g. with their
  // account.
  async deletionsFor(userId: string): Promise<Write[]> {
    return (await this.uploadsOf(userId)).map(doc => ({
      op: 'delete',
      collection: this.collection,
      id: doc.id,
    }));
  }

  private async checkDailyLimit(userId: string) {
    const since = this.now().getTime() - DAY_MS;
    const recent = (await this.uploadsOf(userId)).filter(
      doc => doc.uploadedAt > since
    );
    if (recent.length >= DAILY_UPLOADS) {
      // Free again when the oldest of today's uploads is a day old.
      const oldest = Math.min(...recent.map(doc => doc.uploadedAt));
      throw new TooManyRequestsError(
        `You can upload ${DAILY_UPLOADS} images a day. Try again later, or link to an image instead.`,
        Math.max(1, Math.ceil((oldest - since) / 1000))
      );
    }
  }

  private uploadsOf(userId: string) {
    return this.db.find<MediaDoc>(this.collection, {
      where: [{field: 'userId', op: '==', value: userId}],
    });
  }
}

// Where an upload is served; the site's own address, through its /api.
function mediaUrl(id: string) {
  return `${config.baseUrl}/api/media/${id}`;
}

function tooLarge() {
  return new InvalidImageError(
    'The image is too large: it can be at most 1 MB.',
    413
  );
}

export {MAX_MEDIA_BYTES, MediaService, StoredMedia, tooLarge};
