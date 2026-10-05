import {randomUUID} from 'crypto';
import {config} from '../config';
import {Db, Doc} from '../db';
import {InvalidImageError} from '../errors';
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
  data: Uint8Array;
}

// Profile pictures people upload, stored in the database. Each upload gets a
// new id, so its URL never changes content and browsers may cache it for
// good; replacing a picture deletes the old one.
class ProfileImagesService {
  private readonly collection = 'profileImages';

  constructor(private readonly db: Db) {}

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
        `The picture is ${info.width} × ${info.height} pixels; it can be at most ${MAX_IMAGE_SIDE} × ${MAX_IMAGE_SIDE}.`
      );
    }

    const id = randomUUID();
    await this.db.set(this.collection, id, {
      userId,
      contentType: info.type,
      data,
    });
    return id;
  }

  async get(id: string) {
    return this.db.get<ProfileImageDoc>(this.collection, id);
  }

  // The ids of every picture a user uploaded, e.g. to delete them with the
  // account.
  async idsOf(userId: string) {
    const docs = await this.db.find<ProfileImageDoc>(this.collection, {
      where: [{field: 'userId', op: '==', value: userId}],
    });
    return docs.map(doc => doc.id);
  }

  // Deletes a user's picture; another user's is left alone.
  async delete(userId: string, id: string) {
    const doc = await this.get(id);
    if (doc?.userId === userId) {
      await this.db.delete(this.collection, id);
    }
  }
}

// Where an uploaded picture is served. Stored as the user's image URL.
const profileImagePrefix = () => `${config.baseUrl}/api/profile-images/`;

function profileImageUrl(id: string) {
  return profileImagePrefix() + id;
}

// The id of an uploaded picture, if this image URL is one.
function uploadedImageId(image: string | undefined) {
  const prefix = profileImagePrefix();
  return image?.startsWith(prefix) ? image.slice(prefix.length) : undefined;
}

function tooLarge() {
  return new InvalidImageError(
    `The picture is too large: it can be at most ${MAX_IMAGE_KB} KB.`,
    413
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
