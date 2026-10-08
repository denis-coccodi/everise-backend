import * as express from 'express';
import {route} from '../api';
import {UpstreamError} from '../errors';
import {PartyFinderReader} from './party-finder-reader';
import {PartyFinderQuery, PartyFinderResponse} from './party-finder-schemas';

// The Party Finder page: a data centre's listings, as xivpf.com collects
// them from players' Remote Party Finder plugin (PartyFinderReader). Open
// to everyone.
class PartyFinderRouter {
  constructor(private readonly reader: PartyFinderReader) {}

  get router() {
    const router = express.Router();

    route(
      router,
      {
        method: 'get',
        path: '/party-finder',
        summary: "A data centre's Party Finder listings",
        query: PartyFinderQuery,
        responses: {
          200: {description: 'The listings.', schema: PartyFinderResponse},
        },
      },
      async (req, res) => {
        const board = await this.reader.board(req.query.dataCentre);
        if (!board) throw unreachable();
        // The same for everyone, and fresh for a short while.
        res.set('Cache-Control', 'public, max-age=15').json(board);
      },
    );

    return router;
  }
}

function unreachable() {
  return new UpstreamError(
    "The Party Finder listings can't be reached right now. Try again in a minute.",
  );
}

export {PartyFinderRouter, unreachable};
