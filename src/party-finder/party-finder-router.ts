import * as express from 'express';
import {route} from '../api';
import {UpstreamError} from '../errors';
import {REGION_LIST} from './data-centres';
import {PartyFinderSource} from './party-finder-board';
import {PartyFinderQuery, PartyFinderResponse} from './party-finder-schemas';
import {PARTY_FINDER_ICONS, categoryIcon} from './xivpf-duties';
import {PartyFinderListing} from './xivpf-listing';

// A duty's level, sort key and type icon, by its name in lower case.
type DutiesByName = () => Promise<
  ReadonlyMap<string, {level: number; sortKey: number; icon: number | null}>
>;

// The duty data changes only with a refresh: it's read again after this.
const DUTIES_CACHE_MS = 10 * 60 * 1000;

// The Party Finder page: a data centre's listings, as xivpf.com collects
// them from players' Remote Party Finder plugin. Open to everyone. Each
// listing gets its duty's level and sort key (the game lists the highest
// level first, then by the game's own order) and its duty type's icon from
// the duty data.
class PartyFinderRouter {
  private duties?: {
    at: number;
    byName: Awaited<ReturnType<DutiesByName>>;
  };

  constructor(
    private readonly source: PartyFinderSource,
    private readonly dutiesByName: DutiesByName,
    private readonly now: () => Date,
  ) {}

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
        const board = await this.source.board(req.query.dataCentre);
        if (!board) {
          throw new UpstreamError(
            "The Party Finder listings can't be reached right now. Try again in a minute.",
          );
        }
        const duties = await this.readDuties();
        // The same for everyone, and fresh for a short while.
        res.set('Cache-Control', 'public, max-age=15').json({
          ...board,
          regions: REGION_LIST,
          icons: PARTY_FINDER_ICONS,
          listings: board.listings.map(listing => withDuty(listing, duties)),
        });
      },
    );

    return router;
  }

  private async readDuties() {
    const now = this.now().getTime();
    if (!this.duties || now - this.duties.at >= DUTIES_CACHE_MS) {
      this.duties = {at: now, byName: await this.dutiesByName()};
    }
    return this.duties.byName;
  }
}

function withDuty(
  listing: PartyFinderListing,
  duties: Awaited<ReturnType<DutiesByName>>,
) {
  const duty = listing.duty
    ? duties.get(listing.duty.toLowerCase())
    : undefined;
  return {
    ...listing,
    dutyIcon: duty?.icon ?? categoryIcon(listing.category),
    level: duty?.level ?? null,
    sortKey: duty?.sortKey ?? null,
  };
}

export {DutiesByName, PartyFinderRouter};
