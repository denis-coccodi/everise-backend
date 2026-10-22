import {Db} from '../db';
import {DiscordAnnouncer} from '../discord';
import {NotificationsService} from '../notifications';
import {DataCentre, PartyFinderReader} from '../party-finder';
import {Write} from '../db/db-model';
import {NewShare, SharedListingDoc} from './shared-listing-model';

const SHARED_LISTINGS = 'sharedListings';

// The listings members shared, as posts or in the Everise Discord, watched
// until they're no longer on their board (filled up, taken down, or their
// time ran out): then the member gets a notification, and a listing shared
// in the Discord gets a message there saying so. `check` runs every few
// minutes (the Worker's cron trigger). Only the board decides, never the
// time a listing had when shared: a recruiter can reopen it (its timer
// starts over) and close it hours later. A data centre whose listings
// can't be read decides nothing.
class SharedListings {
  constructor(
    private readonly db: Db,
    private readonly reader: PartyFinderReader,
    private readonly notifications: NotificationsService,
    private readonly discord: DiscordAnnouncer,
  ) {}

  // Never fails the share that asked: a listing not watched is logged.
  async watch(share: NewShare) {
    try {
      await this.db.create(SHARED_LISTINGS, share);
    } catch (error) {
      console.error('Party Finder: shared listing not watched', error);
    }
  }

  async check() {
    const shares = await this.db.find<SharedListingDoc>(SHARED_LISTINGS);
    if (shares.length === 0) return;
    const up = new Map<DataCentre, Set<string> | null>();
    for (const dataCentre of new Set(shares.map(share => share.dataCentre))) {
      const board = await this.reader.board(dataCentre).catch(() => null);
      up.set(dataCentre, board && new Set(board.listings.map(l => l.id)));
    }
    const ended = shares.filter(share => {
      const listings = up.get(share.dataCentre);
      return !!listings && !listings.has(share.listingId);
    });
    for (const share of ended) {
      const listing = {
        listingId: share.listingId,
        dataCentre: share.dataCentre,
        title: share.title,
      };
      await this.notifications.listingEnded(
        share.sharerId,
        share.id,
        listing,
        share.articleId,
      );
      if (share.discord) {
        await this.discord.listingEnded(listing, share.sharerName);
      }
    }
    await this.db.batch(
      ended.map((share): Write => ({
        op: 'delete',
        collection: SHARED_LISTINGS,
        id: share.id,
      })),
    );
  }
}

export {SHARED_LISTINGS, SharedListings};
