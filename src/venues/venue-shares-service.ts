import {Db, Doc} from '../db';
import {DiscordAnnouncer} from '../discord';
import {
  NotFoundError,
  TooManyRequestsError,
  UnavailableError,
  UpstreamError,
} from '../errors';
import {ProfilesService, profileView} from '../profiles';
import {User} from '../users';
import {VenuePages} from './venue-pages';

// What a member may write with a shared venue.
const MAX_VENUE_SHARE_COMMENT = 280;
// How often each member may share a venue in Discord.
const DISCORD_INTERVAL_SECONDS = 60;

interface ShareLimitDoc extends Doc {
  until?: number;
}

// Members share venues in the Everise Discord, with their words. The venue
// is read from FFXIV Venues here, never taken from the request, so only the
// venues the site shows can be shared.
class VenueSharesService {
  private readonly limitsCollection = 'postLimits';

  constructor(
    private readonly db: Db,
    private readonly pages: VenuePages,
    private readonly profilesService: ProfilesService,
    private readonly discord: DiscordAnnouncer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async toDiscord(user: User, venueId: string, comment: string | undefined) {
    if (!this.discord.available) {
      throw new UnavailableError(
        "Sharing to the Everise Discord isn't set up on this site.",
      );
    }
    const venue = await this.pages.venue(venueId);
    if (venue === null) throw unreachable();
    if (!venue) throw notListed();
    await this.takeTurn(`venue-discord-${user.id}`);
    const profile = profileView(
      await this.profilesService.getProfile(user.id),
      false,
    );
    const sent = await this.discord.shareVenue(
      {
        username: profile.username,
        displayName: profile.displayName,
        image: profile.image,
      },
      venue,
      comment ?? '',
    );
    if (!sent) {
      throw new UpstreamError(
        "Discord didn't take the message. Try again in a minute.",
      );
    }
  }

  // One share per member per minute: taken in one step, so two at once
  // can't both go through.
  private async takeTurn(key: string) {
    const now = this.now().getTime();
    const taken = await this.db.takeLease(
      this.limitsCollection,
      key,
      'until',
      now,
      now + DISCORD_INTERVAL_SECONDS * 1000,
    );
    if (taken) return;
    const doc = await this.db.get<ShareLimitDoc>(this.limitsCollection, key);
    const wait = Math.max(1, Math.ceil(((doc?.until ?? now) - now) / 1000));
    throw new TooManyRequestsError(
      `You can share another venue in ${wait} seconds.`,
      wait,
    );
  }
}

function unreachable() {
  return new UpstreamError(
    "The venues can't be reached right now. Try again in a few minutes.",
  );
}

function notListed() {
  return new NotFoundError(
    "That venue isn't listed here: it may have closed for good, or isn't one the site shows. Find another on the Venues page.",
  );
}

export {MAX_VENUE_SHARE_COMMENT, VenueSharesService, notListed, unreachable};
