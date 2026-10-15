import * as express from 'express';
import {route} from '../api';
import {UpstreamError} from '../errors';
import {
  VENUE_REGIONS,
  VenueRegionsResponse,
  VenuesQuery,
  VenuesResponse,
} from './venue-schemas';
import {VenuesBoard} from './venues-board';

// The Venues page: a data centre's player-run venues opening this week, as
// FFXIV Venues lists them, so the community's places get seen. Open to
// everyone.
class VenuesRouter {
  constructor(private readonly board: VenuesBoard) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/venues',
        summary: "A data centre's venues opening this week",
        query: VenuesQuery,
        responses: {
          200: {description: 'The venues.', schema: VenuesResponse},
        },
      },
      async (req, res) => {
        const list = await this.board.venues(req.query.dataCentre);
        if (!list) {
          throw new UpstreamError(
            "The venues can't be reached right now. Try again in a few minutes.",
          );
        }
        // The same for everyone, and fresh for a while.
        res
          .set('Cache-Control', 'public, max-age=60')
          .json({...list, regions: VENUE_REGIONS});
      },
    );

    route(
      router,
      {
        method: 'get',
        path: '/venues/regions',
        summary: 'The data centres with venues, by region',
        responses: {
          200: {description: 'The regions.', schema: VenueRegionsResponse},
        },
      },
      async (_req, res) => {
        // Never changes between deploys, and needs no call to FFXIV Venues:
        // the page lists the data centres even when the venues don't load.
        res
          .set('Cache-Control', 'public, max-age=3600')
          .json({regions: VENUE_REGIONS});
      },
    );

    return router;
  }
}

export {VenuesRouter};
