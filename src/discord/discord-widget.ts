import {DiscordFetch} from './discord-announcer';

// The server's public widget, as the site's home page shows it.
interface DiscordWidget {
  name: string;
  // Who's online now.
  presenceCount: number;
  members: {name: string; avatarUrl: string; status: string}[];
}

// The most members the site lists; the count says how many in all.
const MEMBERS_SHOWN = 12;
// Discord refreshes the widget every few minutes anyway.
const CACHE_MS = 60 * 1000;

// Reads the Discord server's widget (Server Settings → Widget → Enable
// Server Widget), cached for a minute. Null when it's off or unreachable.
class DiscordWidgetReader {
  private cached?: {at: number; widget: DiscordWidget | null};

  constructor(
    private readonly guildId: string | undefined,
    private readonly now: () => Date,
    private readonly fetchFn: DiscordFetch = url =>
      (fetch as unknown as DiscordFetch)(url)
  ) {}

  async read(): Promise<DiscordWidget | null> {
    if (!this.guildId) return null;
    const now = this.now().getTime();
    if (this.cached && now - this.cached.at < CACHE_MS) {
      return this.cached.widget;
    }
    const widget = await this.fetchWidget();
    this.cached = {at: now, widget};
    return widget;
  }

  private async fetchWidget(): Promise<DiscordWidget | null> {
    try {
      const response = await this.fetchFn(
        `https://discord.com/api/guilds/${this.guildId}/widget.json`
      );
      if (!response.ok) return null;
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
    } catch {
      return null;
    }
  }
}

export {DiscordWidget, DiscordWidgetReader};
