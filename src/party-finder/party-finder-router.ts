import * as express from 'express';
import {route} from '../api';
import {NotFoundError, UpstreamError} from '../errors';
import {dataCentreOfListing} from './party-finder-board';
import {PartyFinderReader} from './party-finder-reader';
import {
  PartyFinderListingParams,
  PartyFinderListingResponse,
  PartyFinderQuery,
  PartyFinderResponse,
} from './party-finder-schemas';

// The Party Finder page: a data centre's listings, as xivpf.com collects
// them from players' Remote Party Finder plugin (PartyFinderReader), and
// one listing's own page, which links share. Open to everyone.
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

    route(
      router,
      {
        method: 'get',
        path: '/party-finder/listings/:id',
        summary: 'One Party Finder listing, while it is up',
        params: PartyFinderListingParams,
        responses: {
          200: {
            description: 'The listing.',
            schema: PartyFinderListingResponse,
          },
        },
      },
      async (req, res) => {
        const dataCentre = dataCentreOfListing(req.params.id);
        if (!dataCentre) {
          throw new NotFoundError(
            "There's no Party Finder listing at that address. Check the link, or find one on the Party Finder.",
          );
        }
        const found = await this.reader.listingById(dataCentre, req.params.id);
        if (found === null) throw unreachable();
        if (!found) {
          throw new NotFoundError(
            `This listing is no longer up on ${dataCentre}: the party filled up, its time ran out or the recruiter took it down.`,
          );
        }
        res.set('Cache-Control', 'public, max-age=15').json(found);
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
