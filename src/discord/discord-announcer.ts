import {URL} from 'url';
import type {ArticleDto} from '../articles';
import {LiveEvent, LiveFeed} from '../live';
import {escape, fromDiscord, message} from './discord-format';
import {articleMessages} from './discord-messages';
import type {EventDetail} from '../events';
import type {VenueDetail} from '../venues';
import {eventMessage} from './event-message';
import {listingMessage} from './listing-message';
import {venueMessage} from './venue-message';
import {Sharer} from './discord-model';
import {SharedListing} from './discord-model';

// How the app calls Discord (the parts of fetch it uses); tests pass a fake.
type DiscordFetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

// A post isn't held up for long by a slow Discord.
const TIMEOUT_MS = 3000;

// Shares in the Everise Discord channel, through the channel's webhook
// (Channel settings → Integrations → Webhooks), only what members choose
// to: a post they ticked "Also share in the Everise Discord" on, a Party
// Finder listing, a venue or an event. Without a webhook address (staging,
// local) nothing is shared and the site doesn't offer it.
class DiscordAnnouncer {
  constructor(
    private readonly webhookUrl: string | undefined,
    // The site people use: the links and pictures point there.
    private readonly siteUrl: string,
    private readonly fetchFn: DiscordFetch = (url, init) =>
      (fetch as unknown as DiscordFetch)(url, init),
  ) {}

  get available() {
    return !!this.webhookUrl;
  }

  // A post, new or shared later. Never throws: false when Discord didn't
  // take it (a new post is still posted, its announcement lost).
  async announceArticle(article: ArticleDto['article']) {
    for (const message of articleMessages(article, this.siteUrl)) {
      if (!(await this.send(message))) return false;
    }
    return true;
  }

  // A listing shared on its own, linking to its own page on the site (its
  // id names its data centre); false when Discord didn't take it.
  async shareListing(sharer: Sharer, shared: SharedListing, comment: string) {
    const page = fromDiscord(
      `${this.siteUrl}/party-finder/listings/${encodeURIComponent(shared.listing.id)}`,
    );
    return this.send(
      listingMessage(sharer, shared, comment, page, this.siteUrl),
    );
  }

  // A venue shared by a member, linking to its page on the site; false
  // when Discord didn't take it.
  async shareVenue(sharer: Sharer, venue: VenueDetail, comment: string) {
    const page = fromDiscord(
      `${this.siteUrl}/venues/${encodeURIComponent(venue.id)}`,
    );
    return this.send(venueMessage(sharer, venue, comment, page, this.siteUrl));
  }

  // An event shared by a member, linking to its page on the site; false
  // when Discord didn't take it.
  async shareEvent(sharer: Sharer, event: EventDetail, comment: string) {
    const page = fromDiscord(`${this.siteUrl}/events/${event.id}`);
    return this.send(eventMessage(sharer, event, comment, page, this.siteUrl));
  }

  // A listing shared in the channel is no longer up: said there, so nobody
  // tries to join it. False when Discord didn't take it.
  async listingEnded(
    listing: {dataCentre: string; title: string},
    sharerName: string,
  ) {
    return this.send(
      message(
        this.siteUrl,
        `⌛ **${escape(listing.title)}** on ${listing.dataCentre}, shared by ${escape(sharerName)}, is no longer up: the party filled up, its time ran out or the recruiter took it down.`,
      ),
    );
  }

  // Sends one message, waiting until Discord has posted it so the next one
  // comes after it. False when it didn't go through.
  private async send(message: object): Promise<boolean> {
    if (!this.webhookUrl) return false;
    const url = new URL(this.webhookUrl);
    url.searchParams.set('wait', 'true');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const sent = await Promise.race([
        this.fetchFn(url.toString(), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(message),
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS);
        }),
      ]);
      if (!sent.ok) {
        console.error(`Discord message answered ${sent.status}`);
      }
      return sent.ok;
    } catch (err) {
      console.error('Discord message failed', err);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Sends each event to several feeds; one failing doesn't stop the others.
function allFeeds(...feeds: LiveFeed[]): LiveFeed {
  return {
    async publish(event: LiveEvent) {
      await Promise.all(
        feeds.map(feed =>
          feed.publish(event).catch(err => console.error('feed failed', err)),
        ),
      );
    },
  };
}

export {DiscordAnnouncer, DiscordFetch, allFeeds};
