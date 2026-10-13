import {Db, Doc} from '../db';
import {Write} from '../db/db';
import {DiscordAnnouncer} from '../discord';
import {NotificationsService} from '../notifications';
import {DataCentre, PartyFinderReader} from '../party-finder';

// A Party Finder listing a member shared, watched until it's no longer up.
interface SharedListingDoc extends Doc {
  listingId: string;
  dataCentre: DataCentre;
  // What the listing is for, as it was shared ("The Omega Protocol").
  title: string;
  sharerId: string;
  // The member's name then, for the Discord message.
  sharerName: string;
  // The post it was shared as, if it was.
  articleId?: string;
  // Shared in the Everise Discord too (or only there).
  discord: boolean;
  // When its time runs out (ms).
  expiresAt: number;
}

type NewShare = Omit<SharedListingDoc, keyof Doc>;

const SHARED_LISTINGS = 'sharedListings';

// The listings members shared, as posts or in the Everise Discord, watched
// until they're no longer up (filled up, their time ran out, taken down):
// then the member gets a notification, and a listing shared in the Discord
// gets a message there saying so. `check` runs every few minutes (the
// Worker's cron trigger). A data centre whose listings can't be read
// decides nothing, unless a listing's own time has run out.
class SharedListings {
  constructor(
    private readonly db: Db,
    private readonly reader: PartyFinderReader,
    private readonly notifications: NotificationsService,
    private readonly discord: DiscordAnnouncer,
    private readonly now: () => Date,
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
    const now = this.now().getTime();
    const up = new Map<DataCentre, Set<string> | null>();
    for (const dataCentre of new Set(shares.map(share => share.dataCentre))) {
      const board = await this.reader.board(dataCentre).catch(() => null);
      up.set(dataCentre, board && new Set(board.listings.map(l => l.id)));
    }
    const ended = shares.filter(share => {
      const listings = up.get(share.dataCentre);
      return (
        share.expiresAt <= now || (!!listings && !listings.has(share.listingId))
      );
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

export {NewShare, SHARED_LISTINGS, SharedListingDoc, SharedListings};
