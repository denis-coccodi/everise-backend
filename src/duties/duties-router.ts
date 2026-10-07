import {createHash, timingSafeEqual} from 'crypto';
import * as express from 'express';
import {z} from 'zod';
import {route} from '../api';
import {NotFoundError, UnauthorizedError} from '../errors';
import {DutiesService} from './duties-service';
import {
  DutiesRefreshResponse,
  DutyGroupsResponse,
  FrontlineResponse,
  ImagesRefreshResponse,
  JobsResponse,
  ResetsResponse,
  RoulettesResponse,
} from './duty-schemas';
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
    private readonly refreshKey: string | undefined,
  ) {}

  get router() {
    const router = express.Router();

    const get = (
      path: string,
      summary: string,
      schema: z.ZodType,
      read: () => unknown,
      cacheControl?: string,
    ) =>
      route(
        router,
        {
          method: 'get',
          path,
          summary,
          responses: {200: {description: summary, schema}},
        },
        async (_req, res) => {
          if (cacheControl) res.set('Cache-Control', cacheControl);
          res.json(await read());
        },
      );

    get(
      '/duties',
      'The duties, by type',
      DutyGroupsResponse,
      () => this.dutiesService.getDutyGroups(),
      LIVE_CACHE_CONTROL,
    );
    get(
      '/frontline',
      "Today's Frontline map and the rotation",
      FrontlineResponse,
      () => this.dutiesService.getFrontline(),
      LIVE_CACHE_CONTROL,
    );
    // The game's daily and weekly resets, as UTC times.
    get(
      '/resets',
      "The game's daily and weekly resets",
      ResetsResponse,
      () => this.dutiesService.getResets(),
      LIVE_CACHE_CONTROL,
    );
    get('/roulettes', 'The duty roulettes', RoulettesResponse, () =>
      this.dutiesService.getRoulettes(),
    );
    get('/jobs', 'The combat jobs', JobsResponse, () =>
      this.dutiesService.getJobs(),
    );

    // A game image the data refers to by id (job icons, banners...).
    route(
      router,
      {
        method: 'get',
        path: '/images/:id',
        summary: 'A game image',
        tag: 'duties',
        responses: {200: {description: 'The picture.', contentType: 'image/*'}},
      },
      async (req, res) => {
        const image = await this.imagesService.getImage(req.params.id);
        if (!image) throw new NotFoundError('image');
        res
          .type(image.contentType)
          .set('Cache-Control', IMAGE_CACHE_CONTROL)
          .send(Buffer.from(image.data));
      },
    );

    // Re-downloads the game data from XIVAPI and replaces the cached copy.
    // The images follow through /duties/refresh/images. Both need the
    // refresh key in the x-refresh-key header.
    route(
      router,
      {
        method: 'post',
        path: '/duties/refresh',
        summary: 'Read the game data from XIVAPI again (needs x-refresh-key)',
        responses: {
          200: {description: 'What was read.', schema: DutiesRefreshResponse},
        },
      },
      async (req, res) => {
        this.checkRefreshKey(req);
        res.json(await this.dutiesService.refresh());
      },
    );

    // Downloads the next batch of images; call until `pending` is 0.
    route(
      router,
      {
        method: 'post',
        path: '/duties/refresh/images',
        summary: 'Download the next batch of game images (needs x-refresh-key)',
        responses: {
          200: {description: 'How far along.', schema: ImagesRefreshResponse},
        },
      },
      async (req, res) => {
        this.checkRefreshKey(req);
        res.json(await this.imagesService.downloadBatch());
      },
    );

    return router;
  }

  private checkRefreshKey(req: {header(name: string): string | undefined}) {
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
