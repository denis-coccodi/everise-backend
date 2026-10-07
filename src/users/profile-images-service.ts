import {StatusCodes} from 'http-status-codes';
import {randomUUID} from 'crypto';
import {config} from '../config';
import {Db, Doc} from '../db';
import {InvalidImageError} from '../errors';
import {FileStore} from '../files';
import {sitePathRest} from '../site-urls';
import {ImageType, readImageInfo} from './image-info';

// The limits on an uploaded profile picture. Pictures are kept as uploaded
// (not resized) and shown at most about 100 px wide, so 500 px is sharp even
// on high-density screens.
const MAX_IMAGE_KB = 300;
const MAX_IMAGE_BYTES = MAX_IMAGE_KB * 1024;
const MAX_IMAGE_SIDE = 500;

interface ProfileImageDoc extends Doc {
  userId: string;
  contentType: ImageType;
  // Unset on pictures from before the file store: those have `data`, moved
  // to the file store the first time they're read.
  size?: number;
  data?: Uint8Array;
}

// Profile pictures people upload: the bytes in the file store (R2), a
// document each with the owner and type. Each upload gets a new id, so its
// URL never changes content and browsers may cache it for good; replacing a
// picture deletes the old one.
class ProfileImagesService {
  private readonly collection = 'profileImages';

  constructor(
    private readonly db: Db,
    private readonly files: FileStore,
  ) {}

  // Checks an upload against the limits and stores it; returns its id.
  async save(userId: string, data: Uint8Array) {
    if (data.byteLength > MAX_IMAGE_BYTES) {
      throw tooLarge();
    }

    const info = readImageInfo(data);
    if (!info) {
      throw new InvalidImageError('Choose a PNG, JPEG, WebP or GIF picture.');
    }
    if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
      throw new InvalidImageError(
        `The picture is ${info.width} × ${info.height} pixels; it can be at most ${MAX_IMAGE_SIDE} × ${MAX_IMAGE_SIDE}.`,
      );
    }

    // The file first: a document never names a file that isn't there.
    const id = randomUUID();
    await this.files.put(fileKey(id), data, info.type);
    await this.db.set(this.collection, id, {
      userId,
      contentType: info.type,
      size: data.byteLength,
    });
    return id;
  }

  async get(id: string) {
    const doc = await this.db.get<ProfileImageDoc>(this.collection, id);
    if (!doc) return undefined;
    if (doc.data) {
      await this.files.put(fileKey(id), doc.data, doc.contentType);
      await this.db.update(this.collection, id, {
        data: undefined,
        size: doc.data.byteLength,
      });
      return {contentType: doc.contentType, data: doc.data};
    }
    const data = await this.files.get(fileKey(id));
    return data && {contentType: doc.contentType, data};
  }

  // The ids of every picture a user uploaded, e.g. to delete them with the
  // account (deleteFiles, then the documents).
  async idsOf(userId: string) {
    const docs = await this.db.find<ProfileImageDoc>(this.collection, {
      where: [{field: 'userId', op: '==', value: userId}],
    });
    return docs.map(doc => doc.id);
  }

  async deleteFiles(ids: string[]) {
    await this.files.delete(ids.map(fileKey));
  }

  // Deletes a user's picture; another user's is left alone.
  async delete(userId: string, id: string) {
    const doc = await this.db.get<ProfileImageDoc>(this.collection, id);
    if (doc?.userId === userId) {
      await this.deleteFiles([id]);
      await this.db.delete(this.collection, id);
    }
  }
}

// Where a picture's bytes are in the file store.
const fileKey = (id: string) => `profile-images/${id}`;

// Where an uploaded picture is served. Stored as the user's image URL.
const profileImagePrefix = () => `${config.baseUrl}/api/profile-images/`;

function profileImageUrl(id: string) {
  return profileImagePrefix() + id;
}

// The id of an uploaded picture, if this image URL is one (at the site's
// current address or an earlier one).
function uploadedImageId(image: string | undefined) {
  return image ? sitePathRest(image, '/api/profile-images/') : undefined;
}

function tooLarge() {
  return new InvalidImageError(
    `The picture is too large: it can be at most ${MAX_IMAGE_KB} KB.`,
    StatusCodes.REQUEST_TOO_LONG,
  );
}

export {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  ProfileImagesService,
  profileImageUrl,
  tooLarge,
  uploadedImageId,
};
