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
  // When it was last on the board (ms): first, when it was shared. Unset on
  // shares watched before this was kept, which go by createdAt.
  lastSeenAt?: number;
}

type NewShare = Omit<SharedListingDoc, keyof Doc | 'lastSeenAt'>;

const SHARED_LISTINGS = 'sharedListings';

// A listing off its board this long is taken as ended. A recruiter can
// reopen a listing (its timer starts again), and a listing can drop off the
// board for a while (no one's plugin reported it), so neither its time
// running out nor one missing read means it's over.
const GONE_AFTER_MS = 30 * 60 * 1000;

// The listings members shared, as posts or in the Everise Discord, watched
// until they're no longer up: off the board for GONE_AFTER_MS (filled up,
// taken down, or its time ran out and it wasn't reopened). Then the member
// gets a notification, and a listing shared in the Discord gets a message
// there saying so. `check` runs every few minutes (the Worker's cron
// trigger); each run that sees a listing watches it a while longer. A data
// centre whose listings can't be read decides nothing.
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
      const lastSeenAt = this.now().getTime();
      await this.db.create(SHARED_LISTINGS, {...share, lastSeenAt});
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
    const seen: SharedListingDoc[] = [];
    const ended: SharedListingDoc[] = [];
    for (const share of shares) {
      const listings = up.get(share.dataCentre);
      if (!listings) continue;
      if (listings.has(share.listingId)) {
        seen.push(share);
      } else if (now - lastSeen(share) >= GONE_AFTER_MS) {
        ended.push(share);
      }
    }
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
    await this.db.batch([
      ...seen.map((share): Write => ({
        op: 'update',
        collection: SHARED_LISTINGS,
        id: share.id,
        data: {lastSeenAt: now},
      })),
      ...ended.map((share): Write => ({
        op: 'delete',
        collection: SHARED_LISTINGS,
        id: share.id,
      })),
    ]);
  }
}

function lastSeen(share: SharedListingDoc) {
  return share.lastSeenAt ?? new Date(share.createdAt).getTime();
}

export {
  GONE_AFTER_MS,
  NewShare,
  SHARED_LISTINGS,
  SharedListingDoc,
  SharedListings,
};
