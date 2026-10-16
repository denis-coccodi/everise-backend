import {Db, Doc} from '../db';
import {DiscordAnnouncer} from '../discord';
import {
  NotFoundError,
  TooManyRequestsError,
  UnavailableError,
  UpstreamError,
  ValidationError,
} from '../errors';
import {ProfilesService, profileView} from '../profiles';
import {User} from '../users';
import {EventPages} from './event-pages';

// What a member may write with a shared event.
const MAX_EVENT_SHARE_COMMENT = 280;
// How often each member may share an event in Discord.
const DISCORD_INTERVAL_SECONDS = 60;

interface ShareLimitDoc extends Doc {
  until?: number;
}

// Members share events in the Everise Discord, with their words. The event
// is read from Partake here, never taken from the request, so only the
// events the site shows can be shared, and only before they end.
class EventSharesService {
  private readonly limitsCollection = 'postLimits';

  constructor(
    private readonly db: Db,
    private readonly pages: EventPages,
    private readonly profilesService: ProfilesService,
    private readonly discord: DiscordAnnouncer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async toDiscord(user: User, eventId: number, comment: string | undefined) {
    if (!this.discord.available) {
      throw new UnavailableError(
        "Sharing to the Everise Discord isn't set up on this site.",
      );
    }
    const event = await this.pages.event(eventId);
    if (event === null) throw unreachable();
    if (!event) throw notListed();
    if (Date.parse(event.endsAt) <= this.now().getTime()) {
      throw new ValidationError([
        'That event is over: share one that is still to come.',
      ]);
    }
    await this.takeTurn(`event-discord-${user.id}`);
    const profile = profileView(
      await this.profilesService.getProfile(user.id),
      false,
    );
    const sent = await this.discord.shareEvent(
      {username: profile.username, image: profile.image},
      event,
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
      `You can share another event in ${wait} seconds.`,
      wait,
    );
  }
}

function unreachable() {
  return new UpstreamError(
    "The events can't be reached right now. Try again in a few minutes.",
  );
}

function notListed() {
  return new NotFoundError(
    "That event isn't listed here: it may have been removed from Partake, or isn't one the site shows. Find another on the Events page.",
  );
}

export {MAX_EVENT_SHARE_COMMENT, EventSharesService, notListed, unreachable};
