import {relayMessage} from './relay-message';
import {RelayMessage} from './discord-dto';

// How the app calls Discord's API and its file server (the parts of fetch
// it uses); tests pass a fake.
type RelayFetch = (
  url: string,
  init?: {headers?: Record<string, string>},
) => Promise<{
  ok: boolean;
  status: number;
  headers: {get(name: string): string | null};
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

const API = 'https://discord.com/api/v10';
// The messages read each time: far more than a channel gets between two
// reads, so none is missed.
const MESSAGES_READ = 50;
// A picture larger than this isn't copied (the fashion report's is ~1 MB).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// A channel's messages couldn't be read (a wrong id, the bot not let in,
// Discord down); the next read tries again.
class ChannelReadError extends Error {}

// Reads channels of the Everise Discord as its bot (the Everise app's bot,
// with View Channel and Read Message History there, and the Message Content
// intent). Without a token nothing is read.
class DiscordChannel {
  constructor(
    private readonly botToken: string | undefined,
    private readonly fetchFn: RelayFetch = (url, init) =>
      (fetch as unknown as RelayFetch)(url, init),
  ) {}

  get available() {
    return !!this.botToken;
  }

  // The channel's latest messages, oldest first.
  async latest(channelId: string): Promise<RelayMessage[]> {
    const response = await this.fetchFn(
      `${API}/channels/${encodeURIComponent(channelId)}/messages?limit=${MESSAGES_READ}`,
      {headers: {Authorization: `Bot ${this.botToken}`}},
    );
    if (!response.ok) {
      throw new ChannelReadError(
        `Discord answered ${response.status} for channel ${channelId}`,
      );
    }
    const body = await response.json();
    if (!Array.isArray(body)) {
      throw new ChannelReadError(`Discord sent no messages for ${channelId}`);
    }
    return body
      .map(relayMessage)
      .filter((message): message is RelayMessage => !!message)
      .reverse();
  }

  // A picture's bytes and type; undefined when it can't be read or is too
  // big.
  async download(url: string) {
    try {
      const response = await this.fetchFn(url);
      if (!response.ok) return undefined;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) return undefined;
      return {bytes, contentType: response.headers.get('content-type') ?? ''};
    } catch {
      return undefined;
    }
  }
}

export {ChannelReadError, DiscordChannel, RelayFetch};
