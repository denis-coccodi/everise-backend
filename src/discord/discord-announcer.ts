import {URL} from 'url';
import {
  ArticleEvent as ArticleCreated,
  LiveEvent,
  LiveFeed,
} from '../live/live-feed';

// How the app calls Discord (the parts of fetch it uses); tests pass a fake.
type DiscordFetch = (
  url: string,
  init?: {method?: string; headers?: Record<string, string>; body?: string},
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

type ArticleEvent = ArticleCreated['article'];

// The crest's orange, the colour of the line beside each announcement.
const CREST_ORANGE = 0xf78627;
// A post isn't held up for long by a slow Discord.
const TIMEOUT_MS = 3000;

// Announces every new post and roulette result in a Discord channel,
// through the channel's webhook (Channel settings → Integrations →
// Webhooks). Without a webhook address it announces nothing.
class DiscordAnnouncer implements LiveFeed {
  constructor(
    private readonly webhookUrl: string | undefined,
    // The site people use: the links and pictures point there.
    private readonly siteUrl: string,
    private readonly fetchFn: DiscordFetch = (url, init) =>
      (fetch as unknown as DiscordFetch)(url, init),
  ) {}

  async publish(event: LiveEvent): Promise<void> {
    if (!this.webhookUrl || event.type !== 'article-created') return;
    const article = event.article;
    // Discord previews links (and plays videos) only in messages without a
    // card of their own, so the post's first video follows the card as a
    // message of its own.
    const video = article.media.find(item => item.kind === 'video')?.url;
    const messages = [
      this.card(article),
      ...(video ? [this.plain(video)] : []),
    ];
    for (const message of messages) {
      if (!(await this.send(message))) return;
    }
  }

  // Sends one message, waiting until Discord has posted it so the next one
  // comes after it. False when it didn't go through.
  private async send(message: object): Promise<boolean> {
    const url = new URL(this.webhookUrl!);
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
        console.error(`Discord announcement answered ${sent.status}`);
      }
      return sent.ok;
    } catch (err) {
      // The post is saved either way; only the announcement is lost.
      console.error('Discord announcement failed', err);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // A message with just a link, which Discord previews (a video it plays).
  private plain(link: string) {
    return {
      username: 'Everise',
      avatar_url: `${this.siteUrl}/assets/images/everise-crest.png`,
      content: link,
      allowed_mentions: {parse: []},
    };
  }

  // The post as a card: title, description, author, link, picture.
  private card(article: ArticleEvent) {
    const link = `${this.siteUrl}/article/${encodeURIComponent(article.id)}`;
    const author = article.author.username;
    const roulette = article.roulette;
    const embed = {
      title: truncate(article.title, 256),
      url: link,
      description: truncate(article.description, 350),
      color: CREST_ORANGE,
      timestamp: article.createdAt,
      author: {
        name: author,
        url: `${this.siteUrl}/profile/${encodeURIComponent(author)}`,
        icon_url: article.author.image,
      },
      ...(roulette
        ? {
            fields: [
              {name: roulette.type, value: roulette.name, inline: true},
              ...(roulette.detail
                ? [{name: 'Details', value: roulette.detail, inline: true}]
                : []),
              ...(roulette.mode
                ? [{name: 'Party', value: roulette.mode, inline: false}]
                : []),
            ],
          }
        : {}),
      ...imageOf(article, this.siteUrl),
    };
    const headline = roulette
      ? `🎲 **${escape(author)}** spun the duty roulette!`
      : `📜 New post by **${escape(author)}**`;
    return {
      username: 'Everise',
      avatar_url: `${this.siteUrl}/assets/images/everise-crest.png`,
      content: headline,
      embeds: [embed],
      // Never ping anyone, whatever a post says.
      allowed_mentions: {parse: []},
    };
  }
}

// The picture for the announcement: the roulette's banner, or the post's
// first image.
function imageOf(article: ArticleEvent, siteUrl: string) {
  if (article.roulette?.image) {
    return {image: {url: `${siteUrl}/api/images/${article.roulette.image}`}};
  }
  // The first image or GIF (an upload's address is the site's own, which
  // Discord can fetch).
  const first = article.media.find(item => item.kind !== 'video');
  return first ? {image: {url: first.url}} : {};
}

function truncate(text: string, length: number) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

// Usernames with * or _ would otherwise turn into bold or italics.
function escape(text: string) {
  return text.replace(/([*_~`|\\>])/g, '\\$1');
}

// Sends each event to several feeds; one failing doesn't stop the others.
function allFeeds(...feeds: LiveFeed[]): LiveFeed {
  return {
    async publish(event) {
      await Promise.all(
        feeds.map(feed =>
          feed.publish(event).catch(err => console.error('feed failed', err)),
        ),
      );
    },
  };
}

export {DiscordAnnouncer, DiscordFetch, allFeeds};
