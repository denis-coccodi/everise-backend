import {URL} from 'url';
import type {ArticleDto} from '../articles/article-dto';
import {LiveEvent, LiveFeed} from '../live/live-feed';
import {Sharer, fromDiscord} from './discord-format';
import {articleMessages} from './discord-messages';
import {SharedListing, listingMessage} from './listing-message';

// How the app calls Discord (the parts of fetch it uses); tests pass a fake.
type DiscordFetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

// A post isn't held up for long by a slow Discord.
const TIMEOUT_MS = 3000;

// Shares in the Everise Discord channel, through the channel's webhook
// (Channel settings → Integrations → Webhooks), only what members choose
// to: a post they ticked "Also share in the Everise Discord" on, or a Party
// Finder listing. Without a webhook address (staging, local) nothing is
// shared and the site doesn't offer it.
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

  // A new post. Never fails the post: the announcement is lost at worst.
  async announceArticle(article: ArticleDto['article']) {
    for (const message of articleMessages(article, this.siteUrl)) {
      if (!(await this.send(message))) return;
    }
  }

  // A listing shared on its own, linking to it on its data centre's Party
  // Finder page; false when Discord didn't take it.
  async shareListing(sharer: Sharer, shared: SharedListing, comment: string) {
    const page = fromDiscord(
      `${this.siteUrl}/party-finder/${shared.dataCentre.toLowerCase()}?listing=${encodeURIComponent(shared.listing.id)}`,
    );
    return this.send(
      listingMessage(sharer, shared, comment, page, this.siteUrl),
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
