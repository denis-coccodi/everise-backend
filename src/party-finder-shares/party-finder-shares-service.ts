import {Article, ArticlesService} from '../articles';
import {Db, Doc} from '../db';
import {DiscordAnnouncer} from '../discord';
import {
  NotFoundError,
  TooManyRequestsError,
  UnavailableError,
  UpstreamError,
} from '../errors';
import {
  DataCentre,
  PartyFinderReader,
  listingName,
  unreachable,
} from '../party-finder';
import {ProfilesService, profileView} from '../profiles';
import {User} from '../users';

// What a member may write with a shared listing.
const MAX_SHARE_COMMENT = 280;
// How often each member may share: a post, or a message in Discord.
const POST_INTERVAL_SECONDS = 15;
const DISCORD_INTERVAL_SECONDS = 60;

interface ShareLimitDoc extends Doc {
  until?: number;
}

// Members share Party Finder listings: as a post in the feeds, with their
// words (a snapshot of the listing, which ends within the hour), and, when
// they ask, in the Everise Discord; or straight to the Discord channel. The
// listing is read from the board here, never taken from the request.
class PartyFinderSharesService {
  private readonly limitsCollection = 'postLimits';

  constructor(
    private readonly db: Db,
    private readonly reader: PartyFinderReader,
    private readonly articlesService: ArticlesService,
    private readonly profilesService: ProfilesService,
    private readonly discord: DiscordAnnouncer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async post(
    user: User,
    dataCentre: DataCentre,
    listingId: string,
    comment: string | undefined,
    shareToDiscord = false,
  ): Promise<Article> {
    const shared = await this.find(dataCentre, listingId);
    await this.takeTurn(`pf-post-${user.id}`, POST_INTERVAL_SECONDS);
    const {listing} = shared;
    const remaining = listing.slots.filter(slot => !slot.job).length;
    return this.articlesService.createArticle(user.id, {
      title: `Party Finder: ${listingName(listing)}`,
      description: `${listing.world.name} (${dataCentre}) · ${remaining} ${remaining === 1 ? 'player' : 'players'} needed`,
      body: (comment ?? '').trim(),
      tags: ['party-finder'],
      partyFinder: shared,
      shareToDiscord,
    });
  }

  async toDiscord(
    user: User,
    dataCentre: DataCentre,
    listingId: string,
    comment: string | undefined,
  ) {
    if (!this.discord.available) {
      throw new UnavailableError(
        "Sharing to the Everise Discord isn't set up on this site.",
      );
    }
    const shared = await this.find(dataCentre, listingId);
    await this.takeTurn(`pf-discord-${user.id}`, DISCORD_INTERVAL_SECONDS);
    const profile = profileView(
      await this.profilesService.getProfile(user.id),
      false,
    );
    const sent = await this.discord.shareListing(
      {username: profile.username, image: profile.image},
      {dataCentre: shared.dataCentre, listing: shared.listing},
      comment ?? '',
    );
    if (!sent) {
      throw new UpstreamError(
        "Discord didn't take the message. Try again in a minute.",
      );
    }
  }

  // The listing as it is now, with what the page needs to show it.
  private async find(dataCentre: DataCentre, listingId: string) {
    const board = await this.reader.board(dataCentre);
    if (!board) throw unreachable();
    const listing = board.listings.find(l => l.id === listingId);
    if (!listing || Date.parse(listing.expiresAt) <= this.now().getTime()) {
      throw new NotFoundError(
        'That listing has ended or filled up. Pick another one.',
      );
    }
    return {dataCentre, icons: board.icons, listing};
  }

  // One share per member per interval: taken in one step, so two at once
  // can't both go through.
  private async takeTurn(key: string, seconds: number) {
    const now = this.now().getTime();
    const taken = await this.db.takeLease(
      this.limitsCollection,
      key,
      'until',
      now,
      now + seconds * 1000,
    );
    if (taken) return;
    const doc = await this.db.get<ShareLimitDoc>(this.limitsCollection, key);
    const wait = Math.max(1, Math.ceil(((doc?.until ?? now) - now) / 1000));
    throw new TooManyRequestsError(
      `You can share another listing in ${wait} seconds.`,
      wait,
    );
  }
}

export {MAX_SHARE_COMMENT, PartyFinderSharesService};
