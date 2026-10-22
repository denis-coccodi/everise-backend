import {Db, Doc} from '../db';
import {FileStore} from '../files';
import {XivApiClient} from './xivapi-client';
import {ImageRef} from './duty-model';
import {DownloadProgress} from './duty-model';

// Images per download batch. A Worker on the free plan may make 50 outbound
// requests per incoming request, so a batch stays well below that.
const BATCH_SIZE = 25;
// Downloads running at once within a batch, to go easy on XIVAPI.
const CONCURRENCY = 5;

const CONTENT_TYPES: Record<ImageRef['format'], string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
};

// A stored image: its bytes are in the FileStore (R2) at fileKey(id).
// Images stored before have `data` instead, until first read.
interface ImageDoc extends Doc {
  contentType: string;
  data?: Uint8Array;
}

// Where an image's bytes are kept.
function fileKey(id: string | number) {
  return `game-images/${id}`;
}

// What the current refresh still has to download.
interface DownloadsDoc extends Doc {
  images: ImageRef[];
  pending: number[];
  failed: number[];
}

// The ids of every stored image, so old ones can be removed without
// reading the images themselves.
interface IndexDoc extends Doc {
  ids: number[];
}

// Keeps copies of the game images the duty data refers to (job icons, duty
// type icons, duty and roulette banners), served by GET /api/images/:id:
// the bytes in the FileStore (R2), a document per image with its type.
//
// A refresh re-downloads them all, a batch per call, since one call can't
// make enough outbound requests for all of them. Until a batch replaces an
// image the old copy is still served, and once the last batch is done
// images the new data no longer refers to are deleted.
class ImagesService {
  private readonly imagesCollection = 'gameImages';
  private readonly stateCollection = 'gameImageDownloads';
  private readonly downloadsId = 'current';
  private readonly indexId = 'index';

  constructor(
    private readonly db: Db,
    private readonly xivApi: XivApiClient,
    private readonly files: FileStore,
  ) {}

  // Starts downloading `images` from scratch.
  async plan(images: ImageRef[]): Promise<DownloadProgress> {
    await this.db.set(this.stateCollection, this.downloadsId, {
      images,
      pending: images.map(image => image.id),
      failed: [],
    });
    return {total: images.length, pending: images.length, failed: []};
  }

  // Downloads the next batch, and cleans up after the last one.
  async downloadBatch(): Promise<DownloadProgress & {downloaded: number}> {
    const downloads = await this.db.get<DownloadsDoc>(
      this.stateCollection,
      this.downloadsId,
    );
    if (!downloads) {
      return {total: 0, pending: 0, failed: [], downloaded: 0};
    }

    const byId = new Map(downloads.images.map(image => [image.id, image]));
    const batch = downloads.pending
      .slice(0, BATCH_SIZE)
      .map(id => byId.get(id)!);

    const stored: number[] = [];
    const failed: number[] = [];
    const errors: unknown[] = [];
    await inParallel(batch, CONCURRENCY, async image => {
      try {
        const data = await this.xivApi.fetchImage(image);
        if (!data) {
          failed.push(image.id);
          return;
        }
        // The file first, so a document never names a missing file.
        const contentType = CONTENT_TYPES[image.format];
        await this.files.put(fileKey(image.id), data, contentType);
        await this.db.set(this.imagesCollection, String(image.id), {
          contentType,
        });
        stored.push(image.id);
      } catch (err) {
        errors.push(err);
      }
    });

    // Index what was stored even if the batch failed, so cleanup finds it.
    const index = await this.getIndex();
    await this.setIndex([...new Set([...index, ...stored])]);

    // XIVAPI is having trouble: leave the batch pending for the next call.
    if (errors.length > 0) {
      throw errors[0];
    }

    const done = new Set(batch.map(image => image.id));
    const pending = downloads.pending.filter(id => !done.has(id));
    const allFailed = [...downloads.failed, ...failed];
    await this.db.set(this.stateCollection, this.downloadsId, {
      images: downloads.images,
      pending,
      failed: allFailed,
    });

    if (pending.length === 0 && batch.length > 0) {
      await this.removeUnused(new Set(byId.keys()));
    }

    return {
      total: downloads.images.length,
      pending: pending.length,
      failed: allFailed,
      downloaded: stored.length,
    };
  }

  async getImage(id: string) {
    const doc = await this.db.get<ImageDoc>(this.imagesCollection, id);
    if (!doc) return undefined;
    // Stored before the bytes moved to R2: moved now.
    if (doc.data) {
      await this.files.put(fileKey(id), doc.data, doc.contentType);
      await this.db.update(this.imagesCollection, id, {data: undefined});
      return {contentType: doc.contentType, data: doc.data};
    }
    const data = await this.files.get(fileKey(id));
    return data && {contentType: doc.contentType, data};
  }

  private async removeUnused(wanted: Set<number>) {
    const index = await this.getIndex();
    const unused = index.filter(id => !wanted.has(id));
    // The files first, so a failed deletion can be retried.
    await this.files.delete(unused.map(fileKey));
    for (const id of unused) {
      await this.db.delete(this.imagesCollection, String(id));
    }
    await this.setIndex(index.filter(id => wanted.has(id)));
  }

  private async getIndex() {
    const doc = await this.db.get<IndexDoc>(this.stateCollection, this.indexId);
    return doc?.ids ?? [];
  }

  private async setIndex(ids: number[]) {
    await this.db.set(this.stateCollection, this.indexId, {ids});
  }
}

// Runs `task` on every item, at most `limit` at a time.
async function inParallel<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      await task(item);
    }
  };
  await Promise.all(Array.from({length: limit}, worker));
}

export {ImagesService};
