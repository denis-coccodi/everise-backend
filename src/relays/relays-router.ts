import * as express from 'express';
import {route} from '../api';
import {NotFoundError} from '../errors';
import {RelayImages} from './relay-images';
import {
  HuntsQuery,
  HuntsResponse,
  RelayImageParams,
  WeeklyResponse,
} from './relays-schemas';
import {RelaysService} from './relays-service';

// The channels are read every 2 minutes: the pages may be a minute old.
const PAGE_CACHE_CONTROL = 'public, max-age=60';
// A copied picture is named after Discord's attachment: it never changes.
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

// What the Everise Discord relays from the channels it follows: the weekly
// page (Fashion Report, Island Sanctuary) and the hunt trains, with their
// pictures. Open to everyone, guests included.
class RelaysRouter {
  constructor(
    private readonly relays: RelaysService,
    private readonly images: RelayImages,
  ) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/weekly',
        summary: "This week's Fashion Report and Island Sanctuary, and resets",
        responses: {
          200: {description: 'The week.', schema: WeeklyResponse},
        },
      },
      async (_req, res) => {
        res
          .set('Cache-Control', PAGE_CACHE_CONTROL)
          .json(await this.relays.weekly());
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/hunts',
        summary: 'Hunt trains announced by the hunt groups',
        query: HuntsQuery,
        responses: {
          200: {description: 'The hunt trains.', schema: HuntsResponse},
        },
      },
      async (req, res) => {
        res
          .set('Cache-Control', PAGE_CACHE_CONTROL)
          .json(await this.relays.hunts(req.query.dataCentre));
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/relays/images/:file',
        summary: 'A picture from a relayed message',
        params: RelayImageParams,
        responses: {200: {description: 'The file.', contentType: 'image/*'}},
      },
      async (req, res) => {
        const image = await this.images.read(req.params.file);
        if (!image) throw new NotFoundError("There's no such picture.");
        res
          .type(image.contentType)
          .set('Cache-Control', IMAGE_CACHE_CONTROL)
          .set('X-Content-Type-Options', 'nosniff')
          .set('Content-Security-Policy', "default-src 'none'; sandbox")
          .send(Buffer.from(image.bytes));
      },
    );

    return router;
  }
}

export {RelaysRouter};
