import {createHash, timingSafeEqual} from 'crypto';
import * as express from 'express';
import {NotFoundError, UnauthorizedError} from '../errors';
import {DutiesService} from './duties-service';
import {ImagesService} from './images-service';

// Header carrying the key that allows a refresh (the DUTIES_REFRESH_KEY secret).
const REFRESH_KEY_HEADER = 'x-refresh-key';

// Answers that change at the daily reset: never kept without asking again.
const LIVE_CACHE_CONTROL = 'no-cache';

// An image id's picture doesn't change, so browsers may keep it for a week.
const IMAGE_CACHE_CONTROL = 'public, max-age=604800';

class DutiesRouter {
  constructor(
    private readonly dutiesService: DutiesService,
    private readonly imagesService: ImagesService,
    private readonly refreshKey: string | undefined
  ) {}

  get router() {
    const router = express.Router();

    router.get('/duties', async (_req, res, next) => {
      try {
        return res
          .set('Cache-Control', LIVE_CACHE_CONTROL)
          .json(await this.dutiesService.getDutyGroups());
      } catch (err) {
        return next(err);
      }
    });

    router.get('/frontline', async (_req, res, next) => {
      try {
        return res
          .set('Cache-Control', LIVE_CACHE_CONTROL)
          .json(await this.dutiesService.getFrontline());
      } catch (err) {
        return next(err);
      }
    });

    // The game's daily and weekly resets, as UTC times.
    router.get('/resets', (_req, res) =>
      res
        .set('Cache-Control', LIVE_CACHE_CONTROL)
        .json(this.dutiesService.getResets())
    );

    router.get('/roulettes', async (_req, res, next) => {
      try {
        return res.json(await this.dutiesService.getRoulettes());
      } catch (err) {
        return next(err);
      }
    });

    router.get('/jobs', async (_req, res, next) => {
      try {
        return res.json(await this.dutiesService.getJobs());
      } catch (err) {
        return next(err);
      }
    });

    // A game image the data refers to by id (job icons, banners...).
    router.get('/images/:id', async (req, res, next) => {
      try {
        const image = await this.imagesService.getImage(req.params.id);
        if (!image) {
          throw new NotFoundError('image');
        }

        return res
          .type(image.contentType)
          .set('Cache-Control', IMAGE_CACHE_CONTROL)
          .send(Buffer.from(image.data));
      } catch (err) {
        return next(err);
      }
    });

    // Re-downloads the game data from XIVAPI and replaces the cached copy.
    // The images follow through /duties/refresh/images.
    router.post('/duties/refresh', async (req, res, next) => {
      try {
        this.checkRefreshKey(req);

        return res.json(await this.dutiesService.refresh());
      } catch (err) {
        return next(err);
      }
    });

    // Downloads the next batch of images; call until `pending` is 0.
    router.post('/duties/refresh/images', async (req, res, next) => {
      try {
        this.checkRefreshKey(req);

        return res.json(await this.imagesService.downloadBatch());
      } catch (err) {
        return next(err);
      }
    });

    return router;
  }

  private checkRefreshKey(req: express.Request) {
    if (!this.isRefreshKey(req.header(REFRESH_KEY_HEADER))) {
      throw new UnauthorizedError('invalid refresh key');
    }
  }

  // Without a configured key, refreshing is disabled.
  private isRefreshKey(key: string | undefined) {
    if (!this.refreshKey || !key) {
      return false;
    }

    // Hashing gives equal lengths, which timingSafeEqual requires.
    const hash = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(hash(key), hash(this.refreshKey));
  }
}

export {DutiesRouter};
