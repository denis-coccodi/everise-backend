import {DiscordFetch} from './discord-announcer';
import {DiscordWidget} from './discord-model';

// The most members the site lists; the count says how many in all.
const MEMBERS_SHOWN = 12;
// Discord refreshes the widget every few minutes anyway.
const CACHE_MS = 60 * 1000;
// A read that failed is tried again this soon.
const RETRY_MS = 15 * 1000;
// While Discord can't be read, the last widget read is shown this long.
const STALE_MS = 30 * 60 * 1000;

// What a read of Discord gave: the widget; null when the server's widget is
// off (Discord answers 403) or the server unknown (404); 'failed' for
// anything passing (a rate limit, Discord down, no network).
type Read = DiscordWidget | null | 'failed';

// Reads the Discord server's widget (Server Settings → Widget → Enable
// Server Widget), cached for a minute. Discord often limits how fast
// Cloudflare's shared addresses may ask, so a read that fails keeps the
// last widget read (for up to 30 minutes) and is tried again after 15
// seconds, rather than the home page showing no one for a minute. Null
// when the widget is off, or nothing could be read yet.
class DiscordWidgetReader {
  private cached?: {at: number; widget: DiscordWidget | null};
  private lastFailedAt = -Infinity;

  constructor(
    private readonly guildId: string | undefined,
    private readonly now: () => Date,
    private readonly fetchFn: DiscordFetch = url =>
      (fetch as unknown as DiscordFetch)(url),
  ) {}

  async read(): Promise<DiscordWidget | null> {
    if (!this.guildId) return null;
    const now = this.now().getTime();
    const fresh = this.cached && now - this.cached.at < CACHE_MS;
    if (fresh || now - this.lastFailedAt < RETRY_MS) return this.stale(now);
    const read = await this.fetchWidget();
    if (read === 'failed') {
      this.lastFailedAt = now;
      return this.stale(now);
    }
    this.cached = {at: now, widget: read};
    return read;
  }

  // The last widget read, while it isn't too old.
  private stale(now: number) {
    return this.cached && now - this.cached.at < STALE_MS
      ? this.cached.widget
      : null;
  }

  private async fetchWidget(): Promise<Read> {
    try {
      const response = await this.fetchFn(
        `https://discord.com/api/guilds/${this.guildId}/widget.json`,
      );
      if (response.status === 403 || response.status === 404) return null;
      if (!response.ok) {
        console.error(`Discord widget: Discord answered ${response.status}`);
        return 'failed';
      }
      const body = (await response.json()) as {
        name?: string;
        presence_count?: number;
        members?: {username?: string; avatar_url?: string; status?: string}[];
      };
      return {
        name: body.name ?? 'Discord',
        presenceCount: body.presence_count ?? 0,
        members: (body.members ?? []).slice(0, MEMBERS_SHOWN).map(member => ({
          name: member.username ?? '',
          avatarUrl: member.avatar_url ?? '',
          status: member.status ?? 'online',
        })),
      };
    } catch (error) {
      console.error('Discord widget: reading it failed', error);
      return 'failed';
    }
  }
}

export {DiscordWidgetReader};
